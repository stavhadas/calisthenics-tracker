const express = require('express');
const router = express.Router();
const db = require('../db/index');

router.get('/', (req, res) => {
  // Last activity
  const lastActivity = db.prepare(`
    SELECT * FROM activities ORDER BY started_at DESC LIMIT 1
  `).get();

  if (!lastActivity) return res.json({ lastActivity: null });

  // Sets for last activity
  const lastSets = db.prepare(`
    SELECT es.*, COALESCE(ec.display_name, es.garmin_exercise_name) AS display_name,
           COALESCE(ec.track_as, 'reps') AS track_as
    FROM exercise_sets es
    LEFT JOIN exercise_configs ec ON ec.garmin_exercise_name = es.garmin_exercise_name
    WHERE es.activity_id = ?
    ORDER BY es.set_order
  `).all(lastActivity.id);

  // Previous activity of the same level + type (to compare)
  const prevActivity = db.prepare(`
    SELECT * FROM activities
    WHERE activity_type = ? AND level = ? AND id != ?
    ORDER BY started_at DESC LIMIT 1
  `).get(lastActivity.activity_type, lastActivity.level, lastActivity.id);

  let prevSets = [];
  if (prevActivity) {
    prevSets = db.prepare(`
      SELECT es.*, COALESCE(ec.display_name, es.garmin_exercise_name) AS display_name,
             COALESCE(ec.track_as, 'reps') AS track_as
      FROM exercise_sets es
      LEFT JOIN exercise_configs ec ON ec.garmin_exercise_name = es.garmin_exercise_name
      WHERE es.activity_id = ?
      ORDER BY es.set_order
    `).all(prevActivity.id);
  }

  // Build per-exercise summaries for both sessions
  function summariseByExercise(sets) {
    const map = {};
    for (const s of sets) {
      const key = s.garmin_exercise_name;
      if (!map[key]) map[key] = { displayName: s.display_name, trackAs: s.track_as, values: [], setCount: 0 };
      const val = s.track_as === 'time' ? s.duration_seconds : s.reps;
      if (val != null) map[key].values.push(val);
      map[key].setCount++;
    }
    // best = max value
    for (const k of Object.keys(map)) {
      map[k].best = map[k].values.length ? Math.max(...map[k].values) : null;
      map[k].total = map[k].values.reduce((a, b) => a + b, 0);
    }
    return map;
  }

  const lastByEx = summariseByExercise(lastSets);
  const prevByEx = summariseByExercise(prevSets);

  // Historical bests EXCLUDING the current session (to detect genuine new PBs)
  const historicalBests = {};
  const pbRows = db.prepare(`
    SELECT es.garmin_exercise_name,
           MAX(CASE WHEN COALESCE(ec.track_as,'reps') = 'time' THEN es.duration_seconds ELSE es.reps END) AS pb
    FROM exercise_sets es
    JOIN activities a ON a.id = es.activity_id
    LEFT JOIN exercise_configs ec ON ec.garmin_exercise_name = es.garmin_exercise_name
    WHERE a.id != ?
    GROUP BY es.garmin_exercise_name
  `).all(lastActivity.id);
  for (const r of pbRows) historicalBests[r.garmin_exercise_name] = r.pb;

  const insights = Object.entries(lastByEx).map(([key, cur]) => {
    const prev = prevByEx[key];
    const delta = (cur.best != null && prev?.best != null) ? cur.best - prev.best : null;
    const historicalBest = historicalBests[key];
    const isNewPB = cur.best != null && historicalBest != null && cur.best > historicalBest;
    return {
      garminName: key,
      displayName: cur.displayName,
      trackAs: cur.trackAs,
      setCount: cur.setCount,
      best: cur.best,
      total: cur.total,
      prevBest: prev?.best ?? null,
      prevSetCount: prev?.setCount ?? null,
      delta,
      isNewPB,
      isNew: !prev, // exercise not in previous session
    };
  });

  // Also flag exercises from previous session that weren't done this time
  const missing = Object.entries(prevByEx)
    .filter(([key]) => !lastByEx[key])
    .map(([key, p]) => ({
      garminName: key,
      displayName: p.displayName,
      trackAs: p.trackAs,
      missing: true,
      prevBest: p.best,
    }));

  // Current level = highest level in DB
  const currentLevel = db.prepare('SELECT MAX(level) AS lvl FROM activities').get()?.lvl ?? null;

  // Progress for each exercise at current level (last 10 sessions per exercise)
  const levelExercises = db.prepare(`
    SELECT DISTINCT es.garmin_exercise_name,
           COALESCE(ec.display_name, es.garmin_exercise_name) AS display_name,
           COALESCE(ec.track_as, 'reps') AS track_as
    FROM exercise_sets es
    JOIN activities a ON a.id = es.activity_id
    LEFT JOIN exercise_configs ec ON ec.garmin_exercise_name = es.garmin_exercise_name
    WHERE a.level = ?
    ORDER BY display_name
  `).all(currentLevel);

  const exerciseProgress = levelExercises.map(ex => {
    const points = db.prepare(`
      SELECT a.started_at AS date, es.set_order, es.reps, es.duration_seconds,
             COALESCE(ec.track_as,'reps') AS track_as
      FROM exercise_sets es
      JOIN activities a ON a.id = es.activity_id
      LEFT JOIN exercise_configs ec ON ec.garmin_exercise_name = es.garmin_exercise_name
      WHERE es.garmin_exercise_name = ? AND a.level = ?
      ORDER BY a.started_at ASC, es.set_order ASC
    `).all(ex.garmin_exercise_name, currentLevel);

    // Best set per session for sparkline
    const sessionBests = {};
    for (const p of points) {
      const val = p.track_as === 'time' ? p.duration_seconds : p.reps;
      const day = p.date.slice(0, 10);
      if (val != null && (sessionBests[day] == null || val > sessionBests[day])) {
        sessionBests[day] = val;
      }
    }
    const sparkline = Object.entries(sessionBests)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, value }));

    return {
      garminName: ex.garmin_exercise_name,
      displayName: ex.display_name,
      trackAs: ex.track_as,
      sparkline,
    };
  });

  res.json({
    lastActivity,
    prevActivity: prevActivity || null,
    insights,
    missing,
    currentLevel,
    exerciseProgress,
  });
});

module.exports = router;
