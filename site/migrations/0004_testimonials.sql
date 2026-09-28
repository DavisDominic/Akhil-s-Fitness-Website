-- Testimonial submissions (PRD §47/§48.14). One row per submission; Akhil reviews and approves/rejects via
-- Telegram before anything is added to the site — the homepage carousel stays a hand-picked, hand-edited file
-- (src/data/testimonials.ts), so this table is an intake/review queue, not a live data source for the site.
CREATE TABLE testimonials (
  id                     TEXT PRIMARY KEY,
  created_at             TEXT NOT NULL,
  name                   TEXT NOT NULL,
  society                TEXT NOT NULL,
  occupation             TEXT,
  quote                  TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_at            TEXT,
  telegram_status        TEXT NOT NULL DEFAULT 'pending' CHECK (telegram_status IN ('pending','sent','failed')),
  telegram_message_id    INTEGER,
  notify_attempts        INTEGER NOT NULL DEFAULT 0,
  last_attempt_at        TEXT,
  last_error             TEXT,
  ip_hash                TEXT,                             -- salted hash for rate limiting; the raw IP is never stored
  privacy_notice_version TEXT NOT NULL
);
CREATE INDEX idx_testimonials_pending ON testimonials (telegram_status);
CREATE INDEX idx_testimonials_status  ON testimonials (status, created_at);
CREATE INDEX idx_testimonials_ip      ON testimonials (ip_hash, created_at);
