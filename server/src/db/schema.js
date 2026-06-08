const db = require('./index');

const DDL_V1 = `
CREATE TABLE IF NOT EXISTS garmin_session (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  oauth1_token TEXT,
  oauth2_token TEXT,
  credentials_enc TEXT,
  connected_at TEXT,
  last_synced_at TEXT
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  garmin_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  level REAL,
  activity_type TEXT,
  started_at TEXT NOT NULL,
  duration_seconds INTEGER,
  is_partial INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activities_started_at ON activities(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_activities_level ON activities(level);

CREATE TABLE IF NOT EXISTS exercise_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  garmin_exercise_name TEXT NOT NULL,
  set_order INTEGER NOT NULL,
  reps INTEGER,
  duration_seconds REAL,
  weight_kg REAL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_sets_activity ON exercise_sets(activity_id);
CREATE INDEX IF NOT EXISTS idx_sets_garmin_name ON exercise_sets(garmin_exercise_name);

CREATE TABLE IF NOT EXISTS exercise_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  garmin_exercise_name TEXT UNIQUE NOT NULL,
  display_name TEXT,
  track_as TEXT NOT NULL DEFAULT 'reps',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

function migrate() {
  const version = db.pragma('user_version', { simple: true });
  if (version < 1) {
    db.exec(DDL_V1);
    db.pragma('user_version = 1');
    console.log('DB migrated to version 1');
  }
}

module.exports = { migrate };
