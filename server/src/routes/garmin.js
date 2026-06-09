const express = require('express');
const router = express.Router();
const db = require('../db/index');
const garminClient = require('../garmin/client');
const { syncActivities } = require('../garmin/sync');

let syncInProgress = false;
let lastSyncResult = null;

function hasActivities() {
  return db.prepare('SELECT 1 FROM activities LIMIT 1').get() != null;
}

function resetLastSynced() {
  db.prepare("UPDATE garmin_session SET last_synced_at = NULL WHERE id = 1").run();
}

router.get('/status', (req, res) => {
  const session = garminClient.getSessionStatus();
  res.json({
    connected: !!session,
    connectedAt: session?.connected_at || null,
    lastSyncedAt: session?.last_synced_at || null,
    syncInProgress,
    lastSyncResult,
  });
});

router.post('/connect', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  try {
    await garminClient.login(username, password);
  } catch (err) {
    return res.status(401).json({ error: `Garmin login failed: ${err.message}` });
  }

  res.status(202).json({ ok: true, message: 'Connected. Initial import started in background.' });

  if (!syncInProgress) {
    syncInProgress = true;
    lastSyncResult = null;
    syncActivities()
      .then((r) => { lastSyncResult = r; })
      .catch((e) => { lastSyncResult = { error: e.message }; })
      .finally(() => { syncInProgress = false; });
  }
});

router.post('/sync', async (req, res) => {
  const session = garminClient.getSessionStatus();
  if (!session) return res.status(401).json({ error: 'Not connected to Garmin' });
  if (syncInProgress) return res.status(409).json({ error: 'Sync already in progress' });

  // If DB has no activities (e.g. user deleted them), ignore last_synced_at and do a full 30-day backfill
  const since = (!hasActivities() || !session.last_synced_at)
    ? undefined
    : new Date(session.last_synced_at);

  if (!hasActivities()) resetLastSynced();

  syncInProgress = true;
  lastSyncResult = null;
  res.status(202).json({ ok: true, message: since ? 'Incremental sync started' : 'Full 30-day sync started' });

  syncActivities({ since })
    .then((r) => { lastSyncResult = r; })
    .catch((e) => { lastSyncResult = { error: e.message }; })
    .finally(() => { syncInProgress = false; });
});

// Force a full 30-day re-import regardless of last_synced_at
router.post('/resync', async (req, res) => {
  const session = garminClient.getSessionStatus();
  if (!session) return res.status(401).json({ error: 'Not connected to Garmin' });
  if (syncInProgress) return res.status(409).json({ error: 'Sync already in progress' });

  resetLastSynced();
  syncInProgress = true;
  lastSyncResult = null;
  res.status(202).json({ ok: true, message: 'Full 30-day re-sync started' });

  syncActivities()
    .then((r) => { lastSyncResult = r; })
    .catch((e) => { lastSyncResult = { error: e.message }; })
    .finally(() => { syncInProgress = false; });
});

// Refresh workout plans from Garmin without reimporting activities
router.post('/refresh-plans', async (req, res) => {
  const session = garminClient.getSessionStatus();
  if (!session) return res.status(401).json({ error: 'Not connected to Garmin' });
  try {
    const n = await garminClient.fetchAndStoreWorkouts();
    res.json({ ok: true, updated: n });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Force re-import: deletes existing activities and re-fetches fresh from Garmin
// Rebuilds workout step maps with latest parsing logic
router.post('/reimport', async (req, res) => {
  const session = garminClient.getSessionStatus();
  if (!session) return res.status(401).json({ error: 'Not connected to Garmin' });
  if (syncInProgress) return res.status(409).json({ error: 'Sync already in progress' });

  resetLastSynced();
  syncInProgress = true;
  lastSyncResult = null;
  res.status(202).json({ ok: true, message: 'Force reimport started' });

  syncActivities({ force: true })
    .then((r) => { lastSyncResult = r; })
    .catch((e) => { lastSyncResult = { error: e.message }; })
    .finally(() => { syncInProgress = false; });
});

router.delete('/disconnect', (req, res) => {
  garminClient.markDisconnected();
  syncInProgress = false;
  lastSyncResult = null;
  res.json({ ok: true });
});

// List all stored workout plans (names + fetch timestamps)
router.get('/workouts', (req, res) => {
  const rows = db.prepare(
    'SELECT workout_id, workout_name, fetched_at FROM garmin_workouts ORDER BY workout_name'
  ).all();
  res.json(rows);
});

// Export raw OAuth tokens so they can be imported on another instance
router.get('/session-export', (req, res) => {
  const session = db.prepare('SELECT oauth1_token, oauth2_token FROM garmin_session WHERE id = 1').get();
  if (!session?.oauth2_token) {
    return res.status(404).json({ error: 'No active session to export' });
  }
  res.json({ oauth1Token: session.oauth1_token, oauth2Token: session.oauth2_token });
});

// Import OAuth tokens from a trusted instance (avoids login from blocked IPs)
router.post('/session-import', async (req, res) => {
  const { oauth1Token, oauth2Token } = req.body;
  if (!oauth2Token) return res.status(400).json({ error: 'oauth2Token required' });

  try {
    const client = garminClient.getClient();
    const oauth1 = oauth1Token ? JSON.parse(oauth1Token) : null;
    const oauth2 = JSON.parse(oauth2Token);
    client.loadToken(oauth1, oauth2);

    // Verify the tokens are still valid
    await client.getUserProfile();

    db.prepare(`
      INSERT INTO garmin_session (id, oauth1_token, oauth2_token, connected_at)
      VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        oauth1_token = excluded.oauth1_token,
        oauth2_token = excluded.oauth2_token,
        connected_at = excluded.connected_at
    `).run(oauth1Token || null, oauth2Token, new Date().toISOString());

    res.json({ ok: true });
  } catch (err) {
    res.status(401).json({ error: `Tokens invalid or expired: ${err.message}` });
  }
});

module.exports = router;
