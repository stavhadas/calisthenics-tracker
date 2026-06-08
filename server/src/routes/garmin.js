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

router.delete('/disconnect', (req, res) => {
  garminClient.markDisconnected();
  syncInProgress = false;
  lastSyncResult = null;
  res.json({ ok: true });
});

module.exports = router;
