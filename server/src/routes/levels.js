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

  const exercises = db.prepare(`
    SELECT
      es.garmin_exercise_name,
      COALESCE(ec.display_name, es.garmin_exercise_name) AS display_name,
      ec.display_name AS custom_display_name,
      COALESCE(ec.track_as, 'reps') AS track_as,
      COUNT(DISTINCT a.id) AS session_count,
      COUNT(es.id) AS total_sets,
      MAX(a.started_at) AS last_seen
    FROM exercise_sets es
    JOIN activities a ON a.id = es.activity_id
    LEFT JOIN exercise_configs ec ON ec.garmin_exercise_name = es.garmin_exercise_name
    WHERE a.level = ? AND a.activity_type = ?
    GROUP BY es.garmin_exercise_name
    ORDER BY display_name
  `).all(level, type);

  const result = exercises.map(ex => {
    const trackAs = ex.track_as;
    const rows = db.prepare(`
      SELECT
        a.started_at AS date,
        a.id AS activity_id,
        a.name AS activity_name,
        a.level,
        a.activity_type,
        es.set_order,
        es.reps,
        es.duration_seconds,
        es.weight_kg
      FROM exercise_sets es
      JOIN activities a ON a.id = es.activity_id
      WHERE es.garmin_exercise_name = ? AND a.level = ? AND a.activity_type = ?
      ORDER BY a.started_at ASC, es.set_order ASC
    `).all(ex.garmin_exercise_name, level, type);

    const points = rows.map(row => {
      let value = null;
      switch (trackAs) {
        case 'seconds': value = row.reps; break;
        case 'time': value = row.duration_seconds; break;
        default: value = row.reps;
      }
      return { ...row, trackAs, value };
    });

    return { ...ex, progress: points };
  });

  const activities = db.prepare(`
    SELECT id, name, started_at, duration_seconds, is_partial,
           (SELECT COUNT(*) FROM exercise_sets WHERE activity_id = activities.id) AS set_count
    FROM activities
    WHERE level = ? AND activity_type = ?
    ORDER BY started_at DESC
  `).all(level, type);

  res.json({ level, type, exercises: result, activities });
});

module.exports = router;
