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

  // Heuristic: null/0 reps and very short duration = Garmin calibration noise at start of set
  const reps = item.repetitionCount ?? item.reps ?? null;
  const dur = item.duration ?? item.movingDuration ?? 0;
  if ((reps === null || reps === 0) && dur < 3) return true;

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

function extractSetsFromExerciseSets(data, workoutStepMap) {
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

    // 1. Best source: workout step name from the user's Garmin workout plan
    let name = null;
    if (workoutStepMap && s.wktStepIndex != null) {
      name = workoutStepMap[s.wktStepIndex] || null;
    }

    // 2. Fallback: Garmin auto-detected exercise name from sensor data
    if (!name) {
      const exArr = s.exercises || [];
      const rawName = exArr[0]?.name || exArr[0]?.category || '';
      name = rawName && rawName.toUpperCase() !== 'UNKNOWN'
        ? formatGarminName(rawName)
        : 'Unknown';
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
  const { splits, workoutStepMap } = detailResponse;
  if (!splits) return [];

  return (
    extractSetsFromExerciseSets(splits, workoutStepMap) ||
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
};
