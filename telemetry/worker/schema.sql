CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at INTEGER NOT NULL,
  ts INTEGER,
  device_id TEXT NOT NULL,
  session_id TEXT,
  app_version TEXT,
  engine TEXT,
  ua TEXT,
  country TEXT,
  type TEXT NOT NULL,
  message TEXT,
  source TEXT,
  line INTEGER,
  col INTEGER,
  stack TEXT,
  url TEXT,
  data TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_received ON events(received_at);
CREATE INDEX IF NOT EXISTS idx_events_type_received ON events(type, received_at);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE TABLE IF NOT EXISTS rate (
  device_id TEXT NOT NULL,
  win INTEGER NOT NULL,
  reqs INTEGER NOT NULL DEFAULT 0,
  evts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, win)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  session_id TEXT,
  app_version TEXT,
  engine TEXT,
  kind TEXT,
  url TEXT,
  summary TEXT,
  size_raw INTEGER,
  size_gz INTEGER,
  payload BLOB
);
CREATE INDEX IF NOT EXISTS idx_reports_received ON reports(received_at);

-- Generated thumbnails (1.3.0): JPEG bytes served at GET /v1/thumbs/<slug>.jpg
CREATE TABLE IF NOT EXISTS thumbs (
  slug TEXT PRIMARY KEY,
  bytes BLOB NOT NULL,
  etag TEXT NOT NULL,
  size INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 1.4.0 pop-up facts (also created lazily by the Worker on first PUT /v1/facts/<slug>.json)
CREATE TABLE IF NOT EXISTS facts (slug TEXT PRIMARY KEY, json TEXT NOT NULL, etag TEXT, size INTEGER, updated_at INTEGER);
