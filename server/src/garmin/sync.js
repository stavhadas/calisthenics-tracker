const { subDays } = require('date-fns');
const db = require('../db/index');
const garminClient = require('./client');
const { parseActivityName, parseActivitySets, isPartialActivity } = require('./parser');

// Lazy-initialized prepared statements (tables may not exist at require-time)
let stmts = null;
function getStmts() {
  if (stmts) return stmts;
  stmts = {
    insertActivity: db.prepare(`
      INSERT OR IGNORE INTO activities
        (garmin_id, name, level, activity_type, started_at, duration_seconds, is_partial, raw_json, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    insertSet: db.prepare(`
      INSERT INTO exercise_sets
        (activity_id, garmin_exercise_name, set_order, reps, duration_seconds, weight_kg, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    insertConfig: db.prepare(`
      INSERT OR IGNORE INTO exercise_configs (garmin_exercise_name, track_as, created_at, updated_at)
      VALUES (?, 'reps', ?, ?)
    `),
    checkExists: db.prepare('SELECT id FROM activities WHERE garmin_id = ?'),
  };
  return stmts;
}

const importActivityTx = db.transaction((garminAct, parsed, sets, isPartial, rawJson) => {
  const { insertActivity, insertSet, insertConfig } = getStmts();
  const now = new Date().toISOString();
  const startedAt = garminAct.startTimeLocal || new Date(garminAct.beginTimestamp).toISOString();

  const result = insertActivity.run(
    String(garminAct.activityId),
    garminAct.activityName || '',
    parsed.level,
    parsed.activityType,
    startedAt,
    Math.round(garminAct.duration || garminAct.elapsedDuration || 0),
    isPartial ? 1 : 0,
    rawJson,
    now
  );

  if (result.changes === 0) return { skipped: true };

  const actId = result.lastInsertRowid;

  for (const s of sets) {
    insertSet.run(actId, s.garminExerciseName, s.setOrder, s.reps, s.durationSeconds, s.weightKg, s.notes);
    insertConfig.run(s.garminExerciseName, now, now);
  }

  return { skipped: false, actId };
});

async function syncActivities({ since } = {}) {
  const session = garminClient.getSessionStatus();
  if (!session) throw new Error('Not connected to Garmin');

  const endDate = new Date();
  const startDate = since instanceof Date ? since : subDays(endDate, 30);

  let imported = 0;
  let skipped = 0;
  const errors = [];

  let activities;
  try {
    activities = await garminClient.getStrengthActivities(startDate, endDate);
  } catch (err) {
    throw new Error(`Failed to fetch activities from Garmin: ${err.message}`);
  }

  for (const act of activities) {
    try {
      const parsed = parseActivityName(act.activityName || '');
      if (!parsed) {
        skipped++;
        continue;
      }

      const already = getStmts().checkExists.get(String(act.activityId));
      if (already) { skipped++; continue; }

      let detailResponse;
      try {
        detailResponse = await garminClient.getActivityDetails(act.activityId);
      } catch (err) {
        errors.push({ activityId: act.activityId, error: `Detail fetch failed: ${err.message}` });
        continue;
      }

      const sets = parseActivitySets(detailResponse);
      const partial = isPartialActivity(detailResponse.summary);

      const rawJson = JSON.stringify({
        activity: act,
        splits: detailResponse.splits,
        workoutStepMap: detailResponse.workoutStepMap,
      });

      const txResult = importActivityTx(act, parsed, sets, partial, rawJson);
      if (txResult.skipped) { skipped++; } else { imported++; }

    } catch (err) {
      errors.push({ activityId: act.activityId, error: err.message });
    }
  }

  garminClient.updateLastSynced();
  return { imported, skipped, errors };
}

module.exports = { syncActivities };
