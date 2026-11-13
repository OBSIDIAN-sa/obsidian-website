-- Obsidian Design bot — D1 schema. Apply with:
--   npx wrangler d1 execute obsidian-bot --remote --file=schema.sql
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS leads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  lang        TEXT NOT NULL DEFAULT 'ar',
  source      TEXT NOT NULL DEFAULT 'bot',      -- bot | staff
  status      TEXT NOT NULL DEFAULT 'new',      -- new | contacted | appointment | quoted | won | closed
  assigned_to INTEGER REFERENCES staff(id)
);
CREATE INDEX IF NOT EXISTS leads_status ON leads(status, created_at);
CREATE INDEX IF NOT EXISTS leads_phone ON leads(phone);

CREATE TABLE IF NOT EXISTS lead_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id    INTEGER NOT NULL REFERENCES leads(id),
  staff_id   INTEGER REFERENCES staff(id),
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_lead ON lead_notes(lead_id);

CREATE TABLE IF NOT EXISTS appointments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  lead_id    INTEGER REFERENCES leads(id),
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  date       TEXT NOT NULL,                     -- YYYY-MM-DD, Riyadh time
  time       TEXT NOT NULL,                     -- HH:MM, Riyadh time
  note       TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'pending'    -- pending | confirmed | done | cancelled | noshow
);
-- One live booking per slot
CREATE UNIQUE INDEX IF NOT EXISTS appt_slot ON appointments(date, time) WHERE status IN ('pending', 'confirmed');
CREATE INDEX IF NOT EXISTS appt_date ON appointments(date, time);

CREATE TABLE IF NOT EXISTS staff (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'staff',     -- admin | staff
  pass_hash  TEXT NOT NULL,
  pass_salt  TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  staff_id   INTEGER NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL                   -- epoch seconds
);

-- Counters for rate limits (keys are hashed; no raw IPs stored)
CREATE TABLE IF NOT EXISTS rate (
  key      TEXT PRIMARY KEY,
  n        INTEGER NOT NULL,
  reset_at INTEGER NOT NULL                     -- epoch seconds
);

-- Staff attendance: one row per check-in; out_at is empty until check-out. A day can hold several rows (split shifts).
CREATE TABLE IF NOT EXISTS attendance (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id  INTEGER NOT NULL REFERENCES staff(id),
  date      TEXT NOT NULL,                      -- YYYY-MM-DD, Riyadh time, of the check-in
  in_at     TEXT NOT NULL,                      -- ISO time
  out_at    TEXT,
  in_by     INTEGER REFERENCES staff(id),       -- who recorded it (the member, or an admin taking attendance)
  out_by    INTEGER REFERENCES staff(id)
);
CREATE INDEX IF NOT EXISTS att_staff_date ON attendance(staff_id, date);
CREATE INDEX IF NOT EXISTS att_date ON attendance(date);
