const express = require('express');
const router = express.Router();
const db = require('../db/index');

router.get('/', (req, res) => {
  const items = db.prepare(`
    SELECT
      ec.garmin_exercise_name,
      COALESCE(ec.display_name, ec.garmin_exercise_name) AS display_name,
      ec.display_name AS custom_display_name,
      ec.track_as,
      COUNT(DISTINCT es.activity_id) AS activity_count,
      COUNT(es.id) AS total_sets,
      MAX(a.started_at) AS last_seen
    FROM exercise_configs ec
    LEFT JOIN exercise_sets es ON es.garmin_exercise_name = ec.garmin_exercise_name
    LEFT JOIN activities a ON a.id = es.activity_id
    GROUP BY ec.garmin_exercise_name
    ORDER BY activity_count DESC, ec.garmin_exercise_name ASC
  `).all();

  res.json({ items });
});

router.patch('/:garminName', (req, res) => {
  const { garminName } = req.params;
  const { displayName, trackAs } = req.body;

  const existing = db.prepare('SELECT * FROM exercise_configs WHERE garmin_exercise_name = ?').get(garminName);
  if (!existing) return res.status(404).json({ error: 'Exercise not found' });

  const updates = [];
  const params = [];

  if (displayName !== undefined) {
    updates.push('display_name = ?');
    params.push(displayName === '' ? null : displayName);
  }
  if (trackAs !== undefined) {
    if (!['reps', 'seconds', 'time'].includes(trackAs)) {
      return res.status(400).json({ error: 'trackAs must be reps, seconds, or time' });
    }
    updates.push('track_as = ?');
    params.push(trackAs);
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(garminName);

  db.prepare(`UPDATE exercise_configs SET ${updates.join(', ')} WHERE garmin_exercise_name = ?`).run(...params);

  const updated = db.prepare('SELECT * FROM exercise_configs WHERE garmin_exercise_name = ?').get(garminName);
  res.json(updated);
});

router.get('/:garminName/progress', (req, res) => {
  const { garminName } = req.params;
  const { from, to } = req.query;

  let where = 'es.garmin_exercise_name = ?';
  const params = [garminName];

  if (from) { where += ' AND a.started_at >= ?'; params.push(from); }
  if (to) { where += ' AND a.started_at <= ?'; params.push(to); }

  const config = db.prepare('SELECT track_as FROM exercise_configs WHERE garmin_exercise_name = ?').get(garminName);
  const trackAs = config?.track_as || 'reps';

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
    WHERE ${where}
    ORDER BY a.started_at ASC, es.set_order ASC
  `).all(...params);

  const points = rows.map((row) => {
    let value = null;
    switch (trackAs) {
      case 'seconds': value = row.reps; break;
      case 'time': value = row.duration_seconds; break;
      default: value = row.reps;
    }
    return { ...row, trackAs, value };
  });

  res.json({ garminName, trackAs, points });
});

module.exports = router;
