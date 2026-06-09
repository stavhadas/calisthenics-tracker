const express = require('express');
const router = express.Router();
const db = require('../db/index');

router.get('/', (req, res) => {
  const { page = 1, limit = 20, type, level, from, to } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = '1=1';
  const params = [];

  if (type) { where += ' AND a.activity_type = ?'; params.push(type.toUpperCase()); }
  if (level) { where += ' AND a.level = ?'; params.push(parseFloat(level)); }
  if (from) { where += ' AND a.started_at >= ?'; params.push(from); }
  if (to) { where += ' AND a.started_at <= ?'; params.push(to); }

  const total = db.prepare(`SELECT COUNT(*) as c FROM activities a WHERE ${where}`).get(...params).c;

  const items = db.prepare(`
    SELECT a.id, a.garmin_id, a.name, a.level, a.activity_type,
           a.started_at, a.duration_seconds, a.is_partial,
           COUNT(es.id) as set_count
    FROM activities a
    LEFT JOIN exercise_sets es ON es.activity_id = a.id
    WHERE ${where}
    GROUP BY a.id
    ORDER BY a.started_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  res.json({ items, total, page: parseInt(page), limit: parseInt(limit) });
});

router.get('/filters', (req, res) => {
  const types = db.prepare('SELECT DISTINCT activity_type FROM activities WHERE activity_type IS NOT NULL ORDER BY activity_type').all().map(r => r.activity_type);
  const levels = db.prepare('SELECT DISTINCT level FROM activities WHERE level IS NOT NULL ORDER BY level').all().map(r => r.level);
  res.json({ types, levels });
});

router.get('/:id', (req, res) => {
  const activity = db.prepare(`
    SELECT id, garmin_id, name, level, activity_type, started_at, duration_seconds, is_partial
    FROM activities WHERE id = ?
  `).get(req.params.id);

  if (!activity) return res.status(404).json({ error: 'Activity not found' });

  const sets = db.prepare(`
    SELECT es.id, es.garmin_exercise_name,
           COALESCE(ec.display_name, es.garmin_exercise_name) as display_name,
           es.set_order, es.reps, es.duration_seconds, es.weight_kg, es.notes,
           COALESCE(ec.track_as, 'reps') as track_as
    FROM exercise_sets es
    LEFT JOIN exercise_configs ec ON ec.garmin_exercise_name = es.garmin_exercise_name
    WHERE es.activity_id = ?
    ORDER BY es.set_order ASC
  `).all(req.params.id);

  const setsWithValue = sets.map(addDisplayValue);

  // Build plan-structured groups when a matching workout plan is in DB
  const { getPlanBlocks } = require('../garmin/parser');
  const { getWorkoutPlanByName } = require('../garmin/client');
  const plan = getWorkoutPlanByName(activity.name);
  let planGroups = null;

  if (plan) {
    const blocks = getPlanBlocks(plan);
    const getConfig = db.prepare(
      'SELECT display_name, track_as FROM exercise_configs WHERE garmin_exercise_name = ?'
    );

    // Group recorded sets by garmin_exercise_name for quick lookup
    const setsByName = {};
    for (const s of setsWithValue) {
      if (!setsByName[s.garmin_exercise_name]) setsByName[s.garmin_exercise_name] = [];
      setsByName[s.garmin_exercise_name].push(s);
    }

    // Consume each block's sets sequentially so duplicate exercise names (e.g. two PULL_UP blocks)
    // each get their own slice of the recorded sets in order
    const consumed = {};
    planGroups = blocks.map(block => {
      const config = getConfig.get(block.name);
      const allSets = setsByName[block.name] || [];
      const offset = consumed[block.name] || 0;
      const blockSets = allSets.slice(offset, offset + block.sets);
      consumed[block.name] = offset + block.sets;

      return {
        garmin_exercise_name: block.name,
        display_name: config?.display_name || block.name,
        track_as: config?.track_as || 'reps',
        planned_sets: block.sets,
        superset_id: block.supersetId,
        superset_iterations: block.supersetIterations,
        sets: blockSets,
        skipped: blockSets.length === 0,
      };
    });
  }

  res.json({ activity, sets: setsWithValue, planGroups });
});

router.get('/:id/raw', (req, res) => {
  const row = db.prepare('SELECT raw_json FROM activities WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  try { res.json(JSON.parse(row.raw_json)); } catch { res.send(row.raw_json); }
});

// Bulk re-parse all activities from stored raw_json
router.post('/reparse-all', (req, res) => {
  const { parseActivitySets } = require('../garmin/parser');
  const { getWorkoutPlanByName } = require('../garmin/client');
  const activities = db.prepare('SELECT id, raw_json FROM activities WHERE raw_json IS NOT NULL').all();

  const del = db.prepare('DELETE FROM exercise_sets WHERE activity_id = ?');
  const ins = db.prepare('INSERT INTO exercise_sets (activity_id, garmin_exercise_name, set_order, reps, duration_seconds, weight_kg, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insConfig = db.prepare("INSERT OR IGNORE INTO exercise_configs (garmin_exercise_name, track_as, created_at, updated_at) VALUES (?, 'reps', ?, ?)");
  const now = new Date().toISOString();

  let totalSets = 0;
  const errors = [];

  for (const act of activities) {
    try {
      const data = JSON.parse(act.raw_json);
      // Inject DB-backed workout plan if raw_json doesn't have one (or always prefer DB version)
      const actName = data.activity?.activityName || '';
      const dbPlan = getWorkoutPlanByName(actName);
      if (dbPlan) data.workoutPlan = dbPlan;

      const sets = parseActivitySets(data);
      db.transaction(() => {
        del.run(act.id);
        for (const s of sets) {
          ins.run(act.id, s.garminExerciseName, s.setOrder, s.reps, s.durationSeconds, s.weightKg, s.notes);
          insConfig.run(s.garminExerciseName, now, now);
        }
      })();
      totalSets += sets.length;
    } catch (e) {
      errors.push({ activityId: act.id, error: e.message });
    }
  }

  res.json({ ok: true, activitiesReparsed: activities.length, totalSets, errors });
});

// Re-parse sets from stored raw_json (useful after fixing the parser without re-fetching)
router.post('/:id/reparse', (req, res) => {
  const { parseActivitySets } = require('../garmin/parser');
  const { getWorkoutPlanByName } = require('../garmin/client');
  const row = db.prepare('SELECT id, raw_json FROM activities WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  let data;
  try { data = JSON.parse(row.raw_json); } catch { return res.status(400).json({ error: 'Bad raw_json' }); }

  const actName = data.activity?.activityName || '';
  const dbPlan = getWorkoutPlanByName(actName);
  if (dbPlan) data.workoutPlan = dbPlan;

  const sets = parseActivitySets(data);

  const now = new Date().toISOString();
  const del = db.prepare('DELETE FROM exercise_sets WHERE activity_id = ?');
  const ins = db.prepare('INSERT INTO exercise_sets (activity_id, garmin_exercise_name, set_order, reps, duration_seconds, weight_kg, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insConfig = db.prepare('INSERT OR IGNORE INTO exercise_configs (garmin_exercise_name, track_as, created_at, updated_at) VALUES (?, \'reps\', ?, ?)');

  db.transaction(() => {
    del.run(row.id);
    for (const s of sets) {
      ins.run(row.id, s.garminExerciseName, s.setOrder, s.reps, s.durationSeconds, s.weightKg, s.notes);
      insConfig.run(s.garminExerciseName, now, now);
    }
  })();

  res.json({ ok: true, setsInserted: sets.length, sets });
});

// Manually edit a single set's reps / duration / weight
router.patch('/:activityId/sets/:setId', (req, res) => {
  const set = db.prepare(
    'SELECT id FROM exercise_sets WHERE id = ? AND activity_id = ?'
  ).get(req.params.setId, req.params.activityId);
  if (!set) return res.status(404).json({ error: 'Set not found' });

  const allowed = ['reps', 'duration_seconds', 'weight_kg'];
  const updates = [];
  const params = [];
  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      params.push(req.body[field]);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  db.prepare(`UPDATE exercise_sets SET ${updates.join(', ')} WHERE id = ?`).run(...params, set.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM activities WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Activity not found' });
  res.json({ ok: true });
});

function addDisplayValue(set) {
  let value = null;
  switch (set.track_as) {
    case 'seconds':
      value = set.reps; // reps field holds seconds
      break;
    case 'time':
      value = set.duration_seconds;
      break;
    default:
      value = set.reps;
  }
  return { ...set, value };
}

module.exports = router;
