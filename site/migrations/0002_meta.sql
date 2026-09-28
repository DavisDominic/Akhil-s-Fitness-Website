-- Small key/value store for operational state (e.g. when the last weekly heartbeat was sent).
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
