-- Trial + waitlist leads (PRD §48.7, addendum §4). One row per captured lead.
CREATE TABLE leads (
  id                    TEXT PRIMARY KEY,                 -- uuid without dashes (fits Telegram's 64-byte callback_data)
  created_at            TEXT NOT NULL,                    -- ISO 8601 UTC
  lead_type             TEXT NOT NULL CHECK (lead_type IN ('trial','waitlist')),
  name                  TEXT NOT NULL,
  whatsapp_e164         TEXT NOT NULL,                    -- e.g. 919876543210
  society               TEXT NOT NULL,
  goal                  TEXT NOT NULL,
  goal_other            TEXT,
  regular_training_time TEXT NOT NULL,                    -- ongoing preference, NOT the trial appointment
  source                TEXT NOT NULL DEFAULT 'direct',   -- poster | mygate | business-card | referral | other | direct
  source_society        TEXT,
  idempotency_key       TEXT NOT NULL UNIQUE,             -- one per form session; makes retries safe
  scheduling_method     TEXT NOT NULL DEFAULT 'manual' CHECK (scheduling_method IN ('manual','calcom')),
  trial_when            TEXT,                             -- entered by Akhil in Telegram, or set by the Cal.com webhook
  lead_status           TEXT NOT NULL DEFAULT 'new' CHECK (lead_status IN ('new','contacted','booked','attended','not-a-fit')),
  first_contacted_at    TEXT,
  nudged_at             TEXT,                             -- set when the "still un-contacted" reminder was sent
  telegram_status       TEXT NOT NULL DEFAULT 'pending' CHECK (telegram_status IN ('pending','sent','failed')),
  telegram_message_id   INTEGER,
  sheet_status          TEXT NOT NULL DEFAULT 'pending' CHECK (sheet_status IN ('pending','sent','failed')),
  notify_attempts       INTEGER NOT NULL DEFAULT 0,
  last_attempt_at       TEXT,
  last_error            TEXT,
  ip_hash               TEXT,                             -- salted hash for rate limiting; the raw IP is never stored
  privacy_notice_version TEXT NOT NULL
);
CREATE INDEX idx_leads_wa      ON leads (whatsapp_e164, created_at);
CREATE INDEX idx_leads_ip      ON leads (ip_hash, created_at);
CREATE INDEX idx_leads_pending ON leads (telegram_status, sheet_status);
CREATE INDEX idx_leads_status  ON leads (lead_status, created_at);

-- Local/dev only: where messages go when Telegram / the Sheet aren't configured (DEV_STUBS=1).
CREATE TABLE dev_outbox (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  channel    TEXT NOT NULL,
  payload    TEXT NOT NULL
);
