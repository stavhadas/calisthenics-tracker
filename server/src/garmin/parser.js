const ACTIVITY_NAME_RE = /^Level\s+([\d.]+)\s*[-–]\s*(.+)$/i;

function parseActivityName(name) {
  if (!name) return null;
  const m = name.match(ACTIVITY_NAME_RE);
  if (!m) return null;
  return {
    level: parseFloat(m[1]),
    activityType: m[2].trim().toUpperCase(),
  };
}

function isRestSet(item) {
  // Explicit setType from Garmin exerciseSets endpoint
  const setType = (item.setType || '').toUpperCase();
  if (setType === 'REST' || setType === 'RECOVERY' || setType === 'TRANSITION') return true;

  // Category-level rest
  const exArr = item.exercises || [];
  const cat = (exArr[0]?.category || item.category || '').toUpperCase();
  if (cat === 'REST' || cat === 'RECOVERY') return true;

  // No exercise type + no reps = sensor noise or unrecognised set.
  // A set with a valid exercise type (e.g. PULL_UP) is kept even with 0 reps — that is a real
  // failed attempt and must be counted so the position-based mapper stays aligned with the plan.
  const rawType = (exArr[0]?.name || item.exerciseName || item.exerciseCategory || '').toUpperCase();
  const reps = item.repetitionCount ?? item.reps ?? null;
  if ((!rawType || rawType === 'UNKNOWN') && (reps === null || reps === 0)) return true;

  return false;
}

function extractExerciseName(item) {
  // Prefer user notes (actual exercise name typed by user)
  const notes = (item.notes || item.description || item.comment || '').trim();
  if (notes) return notes;

  // exerciseSets endpoint fields
  if (item.exerciseName && item.exerciseName.toUpperCase() !== 'UNKNOWN') {
    return formatGarminName(item.exerciseName);
  }
  if (item.exerciseCategory && item.exerciseCategory.toUpperCase() !== 'UNKNOWN') {
    return formatGarminName(item.exerciseCategory);
  }

  // splits / lap endpoint fields
  const exercises = item.exercises || item.exerciseSets || [];
  if (exercises.length > 0) {
    const ex = exercises[0];
    const name = ex.exerciseName || ex.name || ex.category || '';
    if (name && name.toUpperCase() !== 'UNKNOWN') return formatGarminName(name);
  }

  const stepName = (item.workoutStepName || item.stepName || item.lapTriggerType || '').trim();
  if (stepName && stepName.toUpperCase() !== 'UNKNOWN') return stepName;

  return 'Unknown';
}

function formatGarminName(raw) {
  return raw
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function normalizeType(s) {
  return (s || '').toUpperCase().replace(/[\s\-]+/g, '_');
}

function meaningfulDesc(desc, baseName) {
  if (!desc) return false;
  return normalizeType(desc) !== normalizeType(baseName);
}

function resolvedName(desc, baseName) {
  return meaningfulDesc(desc, baseName) ? desc.trim() : formatGarminName(baseName);
}

// Returns the ordered list of exercise blocks from a Garmin workout plan.
// Each block: { type, name, sets, supersetId, supersetIterations }
// supersetId is a shared integer for all exercises in the same multi-exercise RepeatGroupStep
// (null for single-exercise blocks and flat steps).
function getPlanBlocks(workoutPlan) {
  if (!workoutPlan) return [];
  const blocks = [];
  let supersetCounter = 0;

  function collect(steps) {
    for (const step of (steps || [])) {
      if (step.workoutSteps) {
        const iters = step.numberOfIterations || 1;
        const exerciseChildren = step.workoutSteps.filter(s => s.exerciseName || s.displayName);
        const isSuperset = exerciseChildren.length > 1;
        const supersetId = isSuperset ? supersetCounter++ : null;

        for (const inner of step.workoutSteps) {
          const baseName = inner.exerciseName || inner.displayName;
          if (baseName) {
            blocks.push({
              type: normalizeType(baseName),
              name: resolvedName(inner.description, baseName),
              sets: iters,
              supersetId,
              supersetIterations: isSuperset ? iters : null,
            });
          }
        }
      } else {
        const baseName = step.exerciseName || step.displayName;
        if (baseName) {
          blocks.push({
            type: normalizeType(baseName),
            name: resolvedName(step.description, baseName),
            sets: step.numberOfIterations || 1,
            supersetId: null,
            supersetIterations: null,
          });
        }
      }
    }
  }

  for (const seg of (workoutPlan.workoutSegments || [])) collect(seg.workoutSteps);
  return blocks;
}

// Builds a stateful position-based exercise name mapper from a Garmin workout plan.
// Each call to the returned function consumes one set from the matching plan block,
// advancing to the next block when the set count is exhausted.
// This lets us correctly assign distinct names to repeated exercises like 3×HSPU groups.
function buildExerciseNameMapper(workoutPlan) {
  const blocks = getPlanBlocks(workoutPlan);
  if (blocks.length === 0) return null;

  // Per-exercise-type queue so different types don't interfere.
  // For superset blocks (multiple exercises in one RepeatGroupStep), Garmin records them
  // INTERLEAVED per iteration (R₁ L₁ R₂ L₂ …) rather than sequentially (R₁R₂ L₁L₂).
  // We expand the queue to match: for each iteration push one slot per superset exercise.
  const queues = {};
  const processedSupersets = new Set();

  for (const block of blocks) {
    if (block.supersetId != null && !processedSupersets.has(block.supersetId)) {
      const ssBlocks = blocks.filter(b => b.supersetId === block.supersetId);
      const iters = block.supersetIterations;
      for (let iter = 0; iter < iters; iter++) {
        for (const ssBlock of ssBlocks) {
          if (!queues[ssBlock.type]) queues[ssBlock.type] = [];
          queues[ssBlock.type].push({ name: ssBlock.name, remaining: 1 });
        }
      }
      processedSupersets.add(block.supersetId);
    } else if (block.supersetId == null) {
      if (!queues[block.type]) queues[block.type] = [];
      queues[block.type].push({ name: block.name, remaining: block.sets });
    }
  }

  console.log('[garmin] plan blocks:', blocks.map(b => `${b.type}(${b.name},${b.sets})`).join(' → '));

  return function getNameForSet(garminExerciseName) {
    const type = normalizeType(garminExerciseName);
    const queue = queues[type];
    if (!queue?.length) return null;

    const cur = queue[0];
    const name = cur.name;
    cur.remaining--;
    if (cur.remaining <= 0) queue.shift();
    return name;
  };
}

function extractSetsFromExerciseSets(data, workoutStepMap, exerciseNameMapper) {
  // Garmin exerciseSets endpoint: { activityId, exerciseSets: [ { exercises:[{category,name}], duration, repetitionCount, weight, setType, wktStepIndex }, ... ] }
  const rawSets =
    data?.exerciseSets ||
    data?.exercises ||
    (Array.isArray(data) ? data : null);

  if (!rawSets) return null;

  const sets = [];
  let order = 0;

  for (const s of rawSets) {
    if (isRestSet(s)) continue;

    const exArr = s.exercises || [];
    const rawType = exArr[0]?.name || s.exerciseName || s.exerciseCategory || '';

    let name = null;

    // 1. Position-based workout plan matching (differentiates same-type blocks by description)
    if (exerciseNameMapper && rawType) {
      name = exerciseNameMapper(rawType) || null;
    }

    // 2. wktStepIndex fallback (if workout plan wasn't fetched by name but was via workoutId)
    if (!name && workoutStepMap && s.wktStepIndex != null) {
      name = workoutStepMap[s.wktStepIndex] || null;
    }

    // 3. Garmin auto-detected exercise name from sensor data
    if (!name) {
      name = rawType && rawType.toUpperCase() !== 'UNKNOWN'
        ? formatGarminName(rawType)
        : (exArr[0]?.category ? formatGarminName(exArr[0].category) : 'Unknown');
    }

    // Weight: Garmin stores in kg; 0 means bodyweight
    const rawWeight = s.weight ?? s.weightInKg ?? s.avgWeightInKg ?? null;
    const weightKg = rawWeight && rawWeight > 0 ? rawWeight : null;

    sets.push({
      garminExerciseName: name,
      setOrder: order++,
      reps: s.repetitionCount ?? null,
      durationSeconds: s.duration ?? null,
      weightKg,
      notes: (s.notes || s.description || '').trim() || null,
    });
  }

  return sets.length > 0 ? sets : null;
}

function extractSetsFromSplits(data) {
  // splits endpoint: { lapDTOs: [...] } or { splits: [...] } or array
  const items =
    data?.lapDTOs ||
    data?.splitDTOs ||
    data?.splits ||
    data?.items ||
    (Array.isArray(data) ? data : null);

  if (!items) return null;

  const sets = [];
  let order = 0;

  for (const item of items) {
    if (isRestSet(item)) continue;
    sets.push({
      garminExerciseName: extractExerciseName(item),
      setOrder: order++,
      reps: item.repetitionCount ?? item.reps ?? item.repsCount ?? null,
      durationSeconds: item.duration ?? item.movingDuration ?? null,
      weightKg: item.avgWeightInKg ?? item.weightInKg ?? null,
      notes: (item.notes || item.description || '').trim() || null,
    });
  }

  return sets.length > 0 ? sets : null;
}

function parseActivitySets(detailResponse) {
  const { splits, workoutStepMap, workoutPlan } = detailResponse;
  if (!splits) return [];

  const exerciseNameMapper = buildExerciseNameMapper(workoutPlan);

  return (
    extractSetsFromExerciseSets(splits, workoutStepMap, exerciseNameMapper) ||
    extractSetsFromSplits(splits) ||
    []
  );
}

function isPartialActivity(summary) {
  const status = (
    summary?.summaryDTO?.completionStatus ||
    summary?.completionStatus ||
    'COMPLETED'
  ).toUpperCase();
  return status !== 'COMPLETED';
}

module.exports = {
  parseActivityName,
  parseActivitySets,
  isPartialActivity,
  buildExerciseNameMapper,
  getPlanBlocks,
};
