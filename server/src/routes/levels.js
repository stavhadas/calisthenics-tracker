const express = require('express');
const router = express.Router();
const db = require('../db/index');

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT level, activity_type, COUNT(*) AS session_count
    FROM activities
    WHERE level IS NOT NULL
    GROUP BY level, activity_type
    ORDER BY level DESC, activity_type ASC
  `).all();

  const map = {};
  for (const row of rows) {
    if (!map[row.level]) map[row.level] = { level: row.level, types: [] };
    map[row.level].types.push({ type: row.activity_type, sessionCount: row.session_count });
  }

  res.json({ levels: Object.values(map).sort((a, b) => b.level - a.level) });
});

router.get('/:level/:type', (req, res) => {
  const level = parseFloat(req.params.level);
  const type = req.params.type.toUpperCase();

  if (isNaN(level)) return res.status(400).json({ error: 'Invalid level' });

  const { getPlanBlocks } = require('../garmin/parser');

  // Look up the workout plan for this level/type from the pre-fetched DB table
  const actRow = db.prepare(
    'SELECT name FROM activities WHERE level = ? AND activity_type = ? LIMIT 1'
  ).get(level, type);

  const planRow = actRow
    ? db.prepare('SELECT plan_json FROM garmin_workouts WHERE workout_name = ?').get(actRow.name)
    : null;

  let exercises;

  if (planRow) {
    // Plan-based: exercise list comes from the Garmin workout plan definition in plan order
    const plan = JSON.parse(planRow.plan_json);
    const blocks = getPlanBlocks(plan);

    const getConfig = db.prepare(
      'SELECT display_name, track_as FROM exercise_configs WHERE garmin_exercise_name = ?'
    );
    const getStats = db.prepare(`
      SELECT COUNT(DISTINCT a.id) AS session_count,
             COUNT(es.id) AS total_sets,
             MAX(a.started_at) AS last_seen
      FROM exercise_sets es
      JOIN activities a ON a.id = es.activity_id
      WHERE es.garmin_exercise_name = ? AND a.level = ? AND a.activity_type = ?
    `);
    const getProgress = db.prepare(`
      SELECT a.started_at AS date, a.id AS activity_id, a.name AS activity_name,
             a.level, a.activity_type, es.set_order, es.reps, es.duration_seconds, es.weight_kg
      FROM exercise_sets es
      JOIN activities a ON a.id = es.activity_id
      WHERE es.garmin_exercise_name = ? AND a.level = ? AND a.activity_type = ?
      ORDER BY a.started_at ASC, es.set_order ASC
    `);

    exercises = blocks.map(block => {
      const config = getConfig.get(block.name);
      const trackAs = config?.track_as || 'reps';
      const stats = getStats.get(block.name, level, type);
      const rows = getProgress.all(block.name, level, type);

      const points = rows.map(row => {
        let value;
        switch (trackAs) {
          case 'seconds': value = row.reps; break;
          case 'time': value = row.duration_seconds; break;
          default: value = row.reps;
        }
        return { ...row, trackAs, value };
      });

      return {
        garmin_exercise_name: block.name,
        display_name: config?.display_name || block.name,
        custom_display_name: config?.display_name || null,
        track_as: trackAs,
        planned_sets: block.sets,
        session_count: stats?.session_count || 0,
        total_sets: stats?.total_sets || 0,
        last_seen: stats?.last_seen || null,
        progress: points,
      };
    });
  } else {
    // Fallback: derive exercise list from recorded activities (no plan in DB)
    const exRows = db.prepare(`
      SELECT
        es.garmin_exercise_name,
        COALESCE(ec.display_name, es.garmin_exercise_name) AS display_name,
        ec.display_name AS custom_display_name,
        COALESCE(ec.track_as, 'reps') AS track_as,
        COUNT(DISTINCT a.id) AS session_count,
        COUNT(es.id) AS total_sets,
        MAX(a.started_at) AS last_seen,
        MIN(es.set_order) AS first_set_order
      FROM exercise_sets es
      JOIN activities a ON a.id = es.activity_id
      LEFT JOIN exercise_configs ec ON ec.garmin_exercise_name = es.garmin_exercise_name
      WHERE a.level = ? AND a.activity_type = ?
      GROUP BY es.garmin_exercise_name
      ORDER BY first_set_order ASC
    `).all(level, type);

    exercises = exRows.map(ex => {
      const trackAs = ex.track_as;
      const rows = db.prepare(`
        SELECT a.started_at AS date, a.id AS activity_id, a.name AS activity_name,
               a.level, a.activity_type, es.set_order, es.reps, es.duration_seconds, es.weight_kg
        FROM exercise_sets es
        JOIN activities a ON a.id = es.activity_id
        WHERE es.garmin_exercise_name = ? AND a.level = ? AND a.activity_type = ?
        ORDER BY a.started_at ASC, es.set_order ASC
      `).all(ex.garmin_exercise_name, level, type);

      const points = rows.map(row => {
        let value;
        switch (trackAs) {
          case 'seconds': value = row.reps; break;
          case 'time': value = row.duration_seconds; break;
          default: value = row.reps;
        }
        return { ...row, trackAs, value };
      });

      return { ...ex, planned_sets: null, progress: points };
    });
  }

  const activities = db.prepare(`
    SELECT id, name, started_at, duration_seconds, is_partial,
           (SELECT COUNT(*) FROM exercise_sets WHERE activity_id = activities.id) AS set_count
    FROM activities
    WHERE level = ? AND activity_type = ?
    ORDER BY started_at DESC
  `).all(level, type);

  res.json({ level, type, exercises, activities });
});

module.exports = router;
