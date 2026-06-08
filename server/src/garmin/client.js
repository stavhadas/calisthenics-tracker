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
  // Returns { stepIndex: stepName } where stepIndex matches wktStepIndex from exerciseSets
  const map = {};
  const segments = workout?.workoutSegments || [];

  let flatIndex = 0;
  for (const seg of segments) {
    for (const step of (seg.workoutSteps || [])) {
      // exerciseName is the user-defined step name in Garmin workouts
      const name = step.exerciseName || step.description || step.displayName || null;
      if (name) {
        // Store by both 0-based flat index and 1-based stepOrder to cover both conventions
        map[flatIndex] = name;
        map[step.stepOrder] = name;
        map[step.stepOrder - 1] = name;
      }
      flatIndex++;
    }
  }

  return map;
}

async function getActivityDetails(activityId) {
  const client = getClient();
  const base = client.url.ACTIVITY + activityId;

  const summary = await client.getActivity({ activityId });

  // Fetch workout step names if this activity used a Garmin workout plan
  let workoutStepMap = null;
  const workoutId = summary?.workoutId;
  if (workoutId) {
    try {
      const workout = await client.getWorkoutDetail({ workoutId: String(workoutId) });
      workoutStepMap = buildWorkoutStepMap(workout);
      console.log(`[garmin] workout ${workoutId} step map:`, JSON.stringify(workoutStepMap));
    } catch (e) {
      console.log(`[garmin] workout fetch failed for ${workoutId}:`, e.message);
    }
  }

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

  return { summary, splits, workoutStepMap };
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
};
