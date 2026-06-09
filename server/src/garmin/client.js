const { GarminConnect } = require('garmin-connect');
const STRENGTH_TRAINING = 'strength_training';
const crypto = require('crypto');
const db = require('../db/index');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
const ALGORITHM = 'aes-256-gcm';

function encrypt(text) {
  if (!ENCRYPTION_KEY) return text;
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(64, '0').slice(0, 64), 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(text) {
  if (!ENCRYPTION_KEY) return text;
  try {
    const [ivHex, tagHex, encHex] = text.split(':');
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(64, '0').slice(0, 64), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex'), undefined, 'utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}

let gcClient = null;

function getClient() {
  if (!gcClient) gcClient = new GarminConnect({ username: '', password: '' });
  return gcClient;
}

async function loadStoredSession() {
  const session = db.prepare('SELECT * FROM garmin_session WHERE id = 1').get();
  if (!session) return false;

  const client = getClient();
  try {
    if (session.oauth1_token && session.oauth2_token) {
      const oauth1 = JSON.parse(session.oauth1_token);
      const oauth2 = JSON.parse(session.oauth2_token);
      client.loadToken(oauth1, oauth2);
      await client.getUserProfile();
      return true;
    }
  } catch (err) {
    console.warn('Stored Garmin session invalid, trying re-auth:', err.message);
    if (session.credentials_enc) {
      return await reAuthWithStoredCredentials(session);
    }
  }
  return false;
}

async function reAuthWithStoredCredentials(session) {
  try {
    const decrypted = decrypt(session.credentials_enc);
    if (!decrypted) return false;
    const { username, password } = JSON.parse(decrypted);
    return await login(username, password, false);
  } catch (err) {
    console.warn('Re-auth with stored credentials failed:', err.message);
    markDisconnected();
    return false;
  }
}

async function login(username, password, storeCredentials = true) {
  const client = getClient();
  await client.login(username, password);
  persistTokens(storeCredentials ? encrypt(JSON.stringify({ username, password })) : undefined);
  return true;
}

function persistTokens(credentialsEnc) {
  const client = getClient();
  const oauth1 = client.client?.oauth1Token ?? null;
  const oauth2 = client.client?.oauth2Token ?? null;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO garmin_session (id, oauth1_token, oauth2_token, credentials_enc, connected_at)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      oauth1_token = excluded.oauth1_token,
      oauth2_token = excluded.oauth2_token,
      credentials_enc = COALESCE(excluded.credentials_enc, credentials_enc),
      connected_at = excluded.connected_at
  `).run(
    oauth1 ? JSON.stringify(oauth1) : null,
    oauth2 ? JSON.stringify(oauth2) : null,
    credentialsEnc || null,
    now
  );
}

function updateLastSynced() {
  const client = getClient();
  const oauth1 = client.client?.oauth1Token ?? null;
  const oauth2 = client.client?.oauth2Token ?? null;

  db.prepare(`
    UPDATE garmin_session SET
      last_synced_at = ?,
      oauth1_token = COALESCE(?, oauth1_token),
      oauth2_token = COALESCE(?, oauth2_token)
    WHERE id = 1
  `).run(
    new Date().toISOString(),
    oauth1 ? JSON.stringify(oauth1) : null,
    oauth2 ? JSON.stringify(oauth2) : null
  );
}

function markDisconnected() {
  db.prepare('DELETE FROM garmin_session WHERE id = 1').run();
  gcClient = null;
}

function getSessionStatus() {
  return db.prepare('SELECT connected_at, last_synced_at FROM garmin_session WHERE id = 1').get() || null;
}

async function getStrengthActivities(startDate, endDate) {
  const client = getClient();
  const activities = [];
  let start = 0;
  const limit = 100;

  while (true) {
    // strength_training is a subActivityType in the garmin-connect package
    const batch = await client.getActivities(start, limit, undefined, STRENGTH_TRAINING);
    if (!batch || batch.length === 0) break;

    for (const act of batch) {
      const actDate = new Date(act.startTimeLocal || new Date(act.beginTimestamp));
      if (actDate < startDate) return activities;
      if (actDate <= endDate) activities.push(act);
    }

    if (batch.length < limit) break;
    start += limit;
  }

  return activities;
}

function buildWorkoutStepMap(workout) {
  const map = {};
  const segments = workout?.workoutSegments || [];

  // Flatten steps — handle both flat lists and nested RepeatGroupStep structures
  const allSteps = [];
  function collect(steps) {
    for (const step of (steps || [])) {
      if (step.workoutSteps) {
        collect(step.workoutSteps); // RepeatGroupStep container
      } else {
        allSteps.push(step);
      }
    }
  }
  for (const seg of segments) collect(seg.workoutSteps);

  // Count how many distinct step groups share the same exerciseName
  const nameCount = {};
  for (const step of allSteps) {
    const n = step.exerciseName || step.displayName;
    if (n) nameCount[n] = (nameCount[n] || 0) + 1;
  }

  // Assign the final name for each step:
  // - unique exercise type → use Garmin exerciseName (clean, English)
  // - duplicate exercise type → use the step description to differentiate (user's own label)
  //   fallback to "ExerciseName N" if no description
  const nameIdx = {};
  let flatIndex = 0;
  for (const step of allSteps) {
    const baseName = step.exerciseName || step.displayName;
    let name;

    if (!baseName) {
      // rest/unknown step — skip
    } else if (nameCount[baseName] > 1) {
      const desc = step.description?.trim();
      if (desc) {
        name = desc;
      } else {
        nameIdx[baseName] = (nameIdx[baseName] || 0) + 1;
        name = `${baseName} ${nameIdx[baseName]}`;
      }
    } else {
      name = baseName;
    }

    if (name) {
      map[flatIndex] = name;
      if (step.stepOrder != null) {
        map[step.stepOrder] = name;
        map[step.stepOrder - 1] = name;
      }
    }
    flatIndex++;
  }

  console.log('[garmin] workout step map:', JSON.stringify(map));
  return map;
}

// In-memory cache: workoutName → plan detail (warmed by fetchAndStoreWorkouts at sync start)
const _workoutCache = {};

// Fetch every workout in the user's Garmin library and persist to DB.
// Called once at the start of each sync so plans are available before any activity is parsed.
async function fetchAndStoreWorkouts() {
  const client = getClient();
  const raw = await client.getWorkouts(0, 100);
  const list = Array.isArray(raw) ? raw : (raw?.workouts || raw?.content || []);

  const upsert = db.prepare(`
    INSERT INTO garmin_workouts (workout_id, workout_name, plan_json, fetched_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(workout_id) DO UPDATE SET
      workout_name = excluded.workout_name,
      plan_json    = excluded.plan_json,
      fetched_at   = excluded.fetched_at
  `);

  for (const w of list) {
    try {
      const detail = await client.getWorkoutDetail({ workoutId: String(w.workoutId) });
      upsert.run(String(w.workoutId), w.workoutName, JSON.stringify(detail), new Date().toISOString());
      _workoutCache[w.workoutName] = detail;
    } catch (e) {
      console.log(`[garmin] failed to fetch workout "${w.workoutName}":`, e.message);
    }
  }

  console.log(`[garmin] stored ${list.length} workout plans`);
  return list.length;
}

// Read a workout plan by activity name — from memory cache first, then DB.
function getWorkoutPlanByName(name) {
  if (!name) return null;
  if (_workoutCache[name] !== undefined) return _workoutCache[name];

  const row = db.prepare('SELECT plan_json FROM garmin_workouts WHERE workout_name = ?').get(name);
  if (!row) { _workoutCache[name] = null; return null; }

  const plan = JSON.parse(row.plan_json);
  _workoutCache[name] = plan;
  return plan;
}

async function getActivityDetails(activityId) {
  const client = getClient();
  const base = client.url.ACTIVITY + activityId;

  const summary = await client.getActivity({ activityId });

  // Try multiple possible paths where Garmin might embed workoutId in the summary
  const workoutId =
    summary?.workoutId ||
    summary?.metaData?.workoutId ||
    summary?.summaryDTO?.workoutId ||
    null;

  let workoutPlan = null;

  if (workoutId) {
    try {
      workoutPlan = await client.getWorkoutDetail({ workoutId: String(workoutId) });
    } catch (e) {
      console.log(`[garmin] workout fetch via id ${workoutId} failed:`, e.message);
    }
  }

  // Use DB-backed plan (populated by fetchAndStoreWorkouts at sync start)
  if (!workoutPlan) {
    workoutPlan = getWorkoutPlanByName(summary?.activityName || '');
  }

  if (workoutPlan) {
    console.log(`[garmin] using workout plan for "${summary?.activityName}"`);
  }

  const workoutStepMap = workoutPlan ? buildWorkoutStepMap(workoutPlan) : null;

  // Fetch exercise sets
  let splits = null;
  try {
    splits = await client.get(`${base}/exerciseSets`);
    if (splits) {
      console.log(`[garmin] exerciseSets for ${activityId}:`, JSON.stringify(splits).slice(0, 300));
    }
  } catch (e) {
    console.log(`[garmin] exerciseSets failed for ${activityId}:`, e.message);
  }

  // Fallback: splits endpoint
  if (!splits) {
    try {
      splits = await client.get(`${base}/splits`);
    } catch (e) {
      console.log(`[garmin] splits also failed for ${activityId}:`, e.message);
    }
  }

  return { summary, splits, workoutStepMap, workoutPlan };
}

module.exports = {
  getClient,
  loadStoredSession,
  login,
  persistTokens,
  updateLastSynced,
  markDisconnected,
  getSessionStatus,
  getStrengthActivities,
  getActivityDetails,
  fetchAndStoreWorkouts,
  getWorkoutPlanByName,
};
