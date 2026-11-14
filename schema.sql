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

-- Customers register: shared by the whole team (the API also creates these three tables on first use)
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE, city TEXT, address TEXT, type TEXT, note TEXT,
  vip INTEGER NOT NULL DEFAULT 0, lead_id INTEGER, created_by INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);

-- Tasks: status is todo | doing | done
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, note TEXT, assigned_to INTEGER NOT NULL, created_by INTEGER NOT NULL,
  due TEXT, status TEXT NOT NULL DEFAULT 'todo', created_at TEXT NOT NULL, done_at TEXT);
CREATE INDEX IF NOT EXISTS tasks_assigned ON tasks(assigned_to, status);

-- Manager notes shown to everyone: kind is general | task | vip
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL DEFAULT 'general', body TEXT NOT NULL, created_by INTEGER NOT NULL, created_at TEXT NOT NULL);

-- Notes any member writes on a customer, visible to the whole team
CREATE TABLE IF NOT EXISTS customer_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL, staff_id INTEGER, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS cnotes_customer ON customer_notes(customer_id);
-- staff.job (classification: chief | management | showroom_manager | designer | employee) is added by the API with ALTER TABLE on first use; chief and management carry the manager's permissions
