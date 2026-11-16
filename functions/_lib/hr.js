// OBSIDIAN DESIGN — staff system, people side: pay and balances, leave, documents, commissions,
// requests to management, and the devices allowed to sign in.
// Called from the staff router with the signed-in member and the shared helpers. Returns a Response, or null when the route is not here.

export const MONEY_KINDS = ['due', 'debt', 'settle', 'salary'];
export const REQUEST_KINDS = ['general', 'correction', 'leave'];
const DOC_MAX = 4 * 1024 * 1024;       // bytes per file
const CHUNK = 900000;                  // base64 characters per stored row (D1 rows stay under 1 MB)

export const HR_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS money (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER NOT NULL, kind TEXT NOT NULL, amount REAL NOT NULL,
     note TEXT, date TEXT NOT NULL, created_by INTEGER, created_at TEXT NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS money_staff ON money(staff_id, date)',
  `CREATE TABLE IF NOT EXISTS leaves (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER NOT NULL, date_from TEXT NOT NULL, date_to TEXT NOT NULL,
     days REAL NOT NULL, note TEXT, request_id INTEGER, created_by INTEGER, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS commissions (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER NOT NULL, source TEXT NOT NULL, base REAL, percent REAL,
     amount REAL NOT NULL, date TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS docs (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
     uploaded_by INTEGER, created_at TEXT NOT NULL)`,
  'CREATE TABLE IF NOT EXISTS doc_chunks (doc_id INTEGER NOT NULL, seq INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (doc_id, seq))',
  `CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL,
     date TEXT, date_to TEXT, days REAL, in_time TEXT, out_time TEXT, status TEXT NOT NULL DEFAULT 'pending', reply TEXT, created_at TEXT NOT NULL, decided_at TEXT)`,
  'CREATE INDEX IF NOT EXISTS requests_staff ON requests(staff_id, id)',
  `CREATE TABLE IF NOT EXISTS devices (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER NOT NULL, token_hash TEXT NOT NULL, label TEXT,
     status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, last_seen TEXT, UNIQUE(token_hash, staff_id))`,
];
// columns added to older tables; each fails harmlessly once it exists
export const HR_COLUMNS = [
  'ALTER TABLE staff ADD COLUMN salary REAL',
  'ALTER TABLE staff ADD COLUMN leave_days REAL',
  'ALTER TABLE sessions ADD COLUMN device_id INTEGER',
  "ALTER TABLE customers ADD COLUMN stage TEXT DEFAULT 'new'",
];

// A short human name for a device, from its browser's user-agent
export function deviceLabel(ua) {
  ua = String(ua || '');
  const os = /iPhone/.test(ua) ? 'آيفون' : /iPad/.test(ua) ? 'آيباد' : /Android/.test(ua) ? 'أندرويد' : /Windows/.test(ua) ? 'ويندوز' : /Mac OS X|Macintosh/.test(ua) ? 'ماك' : /Linux/.test(ua) ? 'لينكس' : 'جهاز';
  const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'متصفح';
  return os + ' · ' + br;
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; };
const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const validTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '');
// Riyadh wall time to a UTC timestamp
const riyadhIso = (date, time) => new Date(date + 'T' + time + ':00+03:00').toISOString();
// days of annual leave when a member has no number of their own; the head of management can change it for everyone
async function defaultLeave(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'leave_default'").first();
  const v = row ? Number(row.value) : NaN;
  return Number.isFinite(v) ? v : 21;
}

async function balances(env, staffId, year) {
  const m = await env.DB.prepare('SELECT kind, COALESCE(SUM(amount), 0) AS total FROM money WHERE staff_id = ? GROUP BY kind').bind(staffId).all();
  const t = { due: 0, debt: 0, settle: 0, salary: 0 };
  (m.results || []).forEach((r) => { t[r.kind] = r.total; });
  const used = await env.DB.prepare("SELECT COALESCE(SUM(days), 0) AS d FROM leaves WHERE staff_id = ? AND date_from BETWEEN ? AND ?").bind(staffId, year + '-01-01', year + '-12-31').first();
  const com = await env.DB.prepare('SELECT COALESCE(SUM(amount), 0) AS a FROM commissions WHERE staff_id = ?').bind(staffId).first();
  return { dues: t.due, debts: Math.round((t.debt - t.settle) * 100) / 100, salaries_paid: t.salary, leave_used: used.d, commissions: com.a };
}

export async function hrRoutes(c) {
  const { env, request, method, parts, me, chief, finance, json, fail, clean, body, nowIso, todayRiyadh } = c;
  const top = parts[0];
  const idAt = (i) => (/^\d+$/.test(parts[i] || '') ? +parts[i] : 0);
  const today = todayRiyadh();
  const year = today.slice(0, 4);

  /* ---- what waits for the head of management ---- */
  if (top === 'inbox' && method === 'GET') {
    if (!chief) return json({ ok: true, requests: 0, devices: 0 });
    const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM requests WHERE status = 'pending'").first();
    const d = await env.DB.prepare("SELECT COUNT(*) AS n FROM devices WHERE status = 'pending'").first();
    return json({ ok: true, requests: r.n, devices: d.n });
  }

  /* ---- devices: only approved ones can sign in ---- */
  if (top === 'devices') {
    if (!chief) return fail(403, 'chief_only');
    if (method === 'GET') {
      const rows = await env.DB.prepare("SELECT d.id, d.staff_id, d.label, d.status, d.created_at, d.last_seen, s.name FROM devices d LEFT JOIN staff s ON s.id = d.staff_id ORDER BY (d.status = 'pending') DESC, d.id DESC LIMIT 300").all();
      return json({ ok: true, devices: rows.results || [] });
    }
    const id = idAt(1);
    if (!id) return fail(404, 'not_found');
    if (method === 'PATCH') {
      const b = await body(request);
      if (!b || !['approved', 'rejected', 'pending'].includes(b.status)) return fail(422, 'status');
      await env.DB.prepare('UPDATE devices SET status = ? WHERE id = ?').bind(b.status, id).run();
      if (b.status !== 'approved') await env.DB.prepare('DELETE FROM sessions WHERE device_id = ?').bind(id).run();
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE device_id = ?').bind(id), env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(id)]);
      return json({ ok: true });
    }
  }

  /* ---- pay, balances and leave ---- */
  if (top === 'hr') {
    // the whole team in one table, for the payroll report
    if (method === 'GET' && parts.length === 1) {
      if (!chief && !finance) return fail(403, 'admin_only');
      const staff = (await env.DB.prepare('SELECT id, name, job, salary, leave_days FROM staff WHERE active = 1 ORDER BY id').all()).results || [];
      const rows = [];
      const base = await defaultLeave(env);
      for (const s of staff) {
        const b = await balances(env, s.id, year);
        const ent = s.leave_days == null ? base : s.leave_days;
        rows.push({ id: s.id, name: s.name, job: s.job, salary: s.salary || 0, ...b, leave_days: ent, leave_left: Math.round((ent - b.leave_used) * 100) / 100 });
      }
      return json({ ok: true, year, staff: rows, leave_default: base });
    }
    // the yearly leave every member gets unless they have a number of their own
    if (parts[1] === 'default' && method === 'PUT') {
      if (!chief) return fail(403, 'chief_only');
      const b = await body(request);
      const v = num(b && b.leave_days);
      if (!(v >= 0 && v <= 365)) return fail(422, 'days');
      await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('leave_default', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(String(v)).run();
      return json({ ok: true });
    }
    if (parts[1] === 'money' && method === 'PATCH' && idAt(2)) {
      if (!chief) return fail(403, 'chief_only');
      const b = await body(request);
      if (!b) return fail(400, 'bad_request');
      const amount = num(b.amount);
      if (!MONEY_KINDS.includes(b.kind)) return fail(422, 'kind');
      if (!(amount > 0 && amount < 1e7)) return fail(422, 'amount');
      if (!validDate(b.date)) return fail(422, 'date');
      await env.DB.prepare('UPDATE money SET kind = ?, amount = ?, note = ?, date = ? WHERE id = ?').bind(b.kind, amount, clean(b.note, 200), b.date, idAt(2)).run();
      return json({ ok: true });
    }
    if (parts[1] === 'leaves' && method === 'PATCH' && idAt(2)) {
      if (!chief) return fail(403, 'chief_only');
      const b = await body(request);
      if (!b) return fail(400, 'bad_request');
      const days = num(b.days);
      if (!validDate(b.date_from) || !validDate(b.date_to) || b.date_to < b.date_from) return fail(422, 'date');
      if (!(days > 0 && days <= 365)) return fail(422, 'days');
      await env.DB.prepare('UPDATE leaves SET date_from = ?, date_to = ?, days = ?, note = ? WHERE id = ?').bind(b.date_from, b.date_to, days, clean(b.note, 200), idAt(2)).run();
      return json({ ok: true });
    }
    if (parts[1] === 'money' && method === 'DELETE' && idAt(2)) {
      if (!chief) return fail(403, 'chief_only');
      await env.DB.prepare('DELETE FROM money WHERE id = ?').bind(idAt(2)).run();
      return json({ ok: true });
    }
    if (parts[1] === 'leaves' && method === 'DELETE' && idAt(2)) {
      if (!chief) return fail(403, 'chief_only');
      await env.DB.prepare('DELETE FROM leaves WHERE id = ?').bind(idAt(2)).run();
      return json({ ok: true });
    }
    const sid = idAt(1);
    if (sid) {
      const s = await env.DB.prepare('SELECT id, name, job, role, salary, leave_days FROM staff WHERE id = ?').bind(sid).first();
      if (!s) return fail(404, 'not_found');
      const mine = sid === me.id;
      if (!mine && !chief && !finance) return fail(403, 'admin_only');
      if (method === 'GET' && parts.length === 2) {
        const b = await balances(env, sid, year);
        const ent = s.leave_days == null ? await defaultLeave(env) : s.leave_days;
        const money = await env.DB.prepare('SELECT m.id, m.kind, m.amount, m.note, m.date, x.name AS by_name FROM money m LEFT JOIN staff x ON x.id = m.created_by WHERE m.staff_id = ? ORDER BY m.date DESC, m.id DESC LIMIT 300').bind(sid).all();
        const leaves = await env.DB.prepare('SELECT id, date_from, date_to, days, note FROM leaves WHERE staff_id = ? ORDER BY date_from DESC LIMIT 100').bind(sid).all();
        const com = await env.DB.prepare('SELECT id, source, base, percent, amount, date FROM commissions WHERE staff_id = ? ORDER BY date DESC, id DESC LIMIT 300').bind(sid).all();
        const docs = mine || chief ? (await env.DB.prepare('SELECT d.id, d.name, d.mime, d.size, d.created_at, d.uploaded_by, x.name AS by_name FROM docs d LEFT JOIN staff x ON x.id = d.uploaded_by WHERE d.staff_id = ? ORDER BY d.id DESC').bind(sid).all()).results || [] : null;
        return json({
          ok: true, year, today,
          staff: { id: s.id, name: s.name, job: s.job, role: s.role, salary: s.salary || 0, leave_days: ent, leave_own: s.leave_days != null },
          totals: { ...b, leave_left: Math.round((ent - b.leave_used) * 100) / 100 },
          money: money.results || [], leaves: leaves.results || [], commissions: com.results || [], docs,
        });
      }
      if (method === 'PATCH' && parts.length === 2) {
        if (!chief) return fail(403, 'chief_only');
        const b = await body(request);
        if (!b) return fail(400, 'bad_request');
        if (b.salary !== undefined) {
          const v = num(b.salary);
          if (!(v >= 0 && v < 1e7)) return fail(422, 'amount');
          await env.DB.prepare('UPDATE staff SET salary = ? WHERE id = ?').bind(v, sid).run();
        }
        if (b.leave_days === null) await env.DB.prepare('UPDATE staff SET leave_days = NULL WHERE id = ?').bind(sid).run();
        else if (b.leave_days !== undefined) {
          const v = num(b.leave_days);
          if (!(v >= 0 && v <= 365)) return fail(422, 'days');
          await env.DB.prepare('UPDATE staff SET leave_days = ? WHERE id = ?').bind(v, sid).run();
        }
        return json({ ok: true });
      }
      if (method === 'POST' && parts[2] === 'money') {
        if (!chief && !finance) return fail(403, 'admin_only');
        const b = await body(request);
        if (!b) return fail(400, 'bad_request');
        const amount = num(b.amount);
        if (!MONEY_KINDS.includes(b.kind)) return fail(422, 'kind');
        if (!(amount > 0 && amount < 1e7)) return fail(422, 'amount');
        await env.DB.prepare('INSERT INTO money (staff_id, kind, amount, note, date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(sid, b.kind, amount, clean(b.note, 200), validDate(b.date) ? b.date : today, me.id, nowIso()).run();
        return json({ ok: true });
      }
      if (method === 'POST' && parts[2] === 'leaves') {
        if (!chief) return fail(403, 'chief_only');
        const b = await body(request);
        if (!b) return fail(400, 'bad_request');
        const days = num(b.days);
        if (!validDate(b.date_from) || !validDate(b.date_to) || b.date_to < b.date_from) return fail(422, 'date');
        if (!(days > 0 && days <= 365)) return fail(422, 'days');
        await env.DB.prepare('INSERT INTO leaves (staff_id, date_from, date_to, days, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(sid, b.date_from, b.date_to, days, clean(b.note, 200), me.id, nowIso()).run();
        return json({ ok: true });
      }
    }
  }

  /* ---- commissions: each member records their own ---- */
  if (top === 'commissions') {
    if (method === 'GET') {
      if (!chief && !finance) return fail(403, 'admin_only');
      const rows = await env.DB.prepare('SELECT c.id, c.staff_id, c.source, c.base, c.percent, c.amount, c.date, s.name FROM commissions c LEFT JOIN staff s ON s.id = c.staff_id ORDER BY c.date DESC, c.id DESC LIMIT 500').all();
      return json({ ok: true, commissions: rows.results || [] });
    }
    if (method === 'POST') {
      const b = await body(request);
      if (!b) return fail(400, 'bad_request');
      const source = clean(b.source, 300);
      if (source.length < 3) return fail(422, 'source');
      const base = b.base === '' || b.base == null ? null : num(b.base);
      const percent = b.percent === '' || b.percent == null ? null : num(b.percent);
      if (base != null && !(base >= 0 && base < 1e9)) return fail(422, 'amount');
      if (percent != null && !(percent >= 0 && percent <= 100)) return fail(422, 'percent');
      let amount = b.amount === '' || b.amount == null ? NaN : num(b.amount);
      if (!Number.isFinite(amount) && base != null && percent != null) amount = Math.round(base * percent) / 100;
      if (!(amount > 0 && amount < 1e8)) return fail(422, 'amount');
      const target = chief && idAt(1) ? idAt(1) : me.id;
      await env.DB.prepare('INSERT INTO commissions (staff_id, source, base, percent, amount, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(target, source, base, percent, amount, validDate(b.date) ? b.date : today, nowIso()).run();
      return json({ ok: true });
    }
    if (method === 'PATCH' && idAt(1)) {
      if (!chief) return fail(403, 'chief_only');
      const b = await body(request);
      if (!b) return fail(400, 'bad_request');
      const source = clean(b.source, 300), amount = num(b.amount);
      const base = b.base === '' || b.base == null ? null : num(b.base), percent = b.percent === '' || b.percent == null ? null : num(b.percent);
      if (source.length < 3) return fail(422, 'source');
      if (!(amount > 0 && amount < 1e8)) return fail(422, 'amount');
      if (percent != null && !(percent >= 0 && percent <= 100)) return fail(422, 'percent');
      if (!validDate(b.date)) return fail(422, 'date');
      await env.DB.prepare('UPDATE commissions SET source = ?, base = ?, percent = ?, amount = ?, date = ? WHERE id = ?').bind(source, base, percent, amount, b.date, idAt(1)).run();
      return json({ ok: true });
    }
    if (method === 'DELETE' && idAt(1)) {
      const row = await env.DB.prepare('SELECT staff_id FROM commissions WHERE id = ?').bind(idAt(1)).first();
      if (!row) return fail(404, 'not_found');
      if (!chief && row.staff_id !== me.id) return fail(403, 'chief_only');
      await env.DB.prepare('DELETE FROM commissions WHERE id = ?').bind(idAt(1)).run();
      return json({ ok: true });
    }
  }

  /* ---- documents: a member's own files; the head of management can add to anyone's ---- */
  if (top === 'docs') {
    if (method === 'POST' && parts.length === 1) {
      const b = await body(request, 7 * 1024 * 1024);
      if (!b) return fail(413, 'too_large');
      const target = b.staff_id != null && +b.staff_id !== me.id ? (chief ? +b.staff_id : 0) : me.id;
      if (!target) return fail(403, 'chief_only');
      const exists = await env.DB.prepare('SELECT id FROM staff WHERE id = ?').bind(target).first();
      if (!exists) return fail(422, 'staff');
      const name = clean(b.name, 120);
      const mime = /^[\w.+-]+\/[\w.+-]+$/.test(b.mime || '') ? b.mime : 'application/octet-stream';
      const data = String(b.data || '');
      if (!name || !data || !/^[A-Za-z0-9+/]+=*$/.test(data.slice(0, 2000))) return fail(422, 'file');
      const size = Math.floor(data.length * 3 / 4);
      if (size > DOC_MAX) return fail(413, 'too_large');
      const r = await env.DB.prepare('INSERT INTO docs (staff_id, name, mime, size, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(target, name, mime, size, me.id, nowIso()).run();
      const docId = r.meta.last_row_id;
      for (let i = 0, seq = 0; i < data.length; i += CHUNK, seq++) {
        await env.DB.prepare('INSERT INTO doc_chunks (doc_id, seq, data) VALUES (?, ?, ?)').bind(docId, seq, data.slice(i, i + CHUNK)).run();
      }
      return json({ ok: true, id: docId });
    }
    const id = idAt(1);
    if (id) {
      const d = await env.DB.prepare('SELECT * FROM docs WHERE id = ?').bind(id).first();
      if (!d) return fail(404, 'not_found');
      if (!chief && d.staff_id !== me.id) return fail(403, 'chief_only');
      if (method === 'GET' && parts[2] === 'file') {
        const rows = (await env.DB.prepare('SELECT data FROM doc_chunks WHERE doc_id = ? ORDER BY seq').bind(id).all()).results || [];
        const bin = atob(rows.map((x) => x.data).join(''));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        // shown inline only for images and PDF; anything else downloads
        const inline = /^image\/(png|jpeg|webp|gif)$|^application\/pdf$/.test(d.mime);
        const headers = {
          'Content-Type': inline ? d.mime : 'application/octet-stream',
          'Content-Disposition': (inline ? 'inline' : 'attachment') + "; filename*=UTF-8''" + encodeURIComponent(d.name),
          'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
        };
        // the browser's PDF viewer does not run inside a sandbox, so only images get one
        if (d.mime !== 'application/pdf') headers['Content-Security-Policy'] = "default-src 'none'; sandbox";
        return new Response(bytes, { headers });
      }
      if (method === 'DELETE') {
        if (!chief && d.uploaded_by !== me.id) return fail(403, 'chief_only');
        await env.DB.batch([env.DB.prepare('DELETE FROM doc_chunks WHERE doc_id = ?').bind(id), env.DB.prepare('DELETE FROM docs WHERE id = ?').bind(id)]);
        return json({ ok: true });
      }
    }
  }

  /* ---- requests to management: anyone writes one; only the head of management reads and decides ---- */
  if (top === 'requests') {
    if (method === 'GET' && parts.length === 1) {
      const all = chief && new URL(request.url).searchParams.get('all') === '1';
      const rows = await env.DB.prepare('SELECT r.*, s.name FROM requests r LEFT JOIN staff s ON s.id = r.staff_id' + (all ? '' : ' WHERE r.staff_id = ?') + " ORDER BY (r.status = 'pending') DESC, r.id DESC LIMIT 300").bind(...(all ? [] : [me.id])).all();
      return json({ ok: true, today, requests: rows.results || [] });
    }
    if (method === 'POST' && parts.length === 1) {
      const b = await body(request);
      if (!b) return fail(400, 'bad_request');
      const kind = REQUEST_KINDS.includes(b.kind) ? b.kind : 'general';
      const text = clean(b.body, 1000);
      if (text.length < 3) return fail(422, 'body');
      let date = null, dateTo = null, days = null, tin = null, tout = null;
      if (kind === 'correction') {
        if (!validDate(b.date) || b.date > today) return fail(422, 'date');
        date = b.date; tin = validTime(b.in_time) ? b.in_time : null; tout = validTime(b.out_time) ? b.out_time : null;
        if (tin && tout && tout <= tin) return fail(422, 'time');
      }
      if (kind === 'leave') {
        days = num(b.days);
        if (!validDate(b.date) || !validDate(b.date_to) || b.date_to < b.date) return fail(422, 'date');
        if (!(days > 0 && days <= 365)) return fail(422, 'days');
        date = b.date; dateTo = b.date_to;
      }
      await env.DB.prepare('INSERT INTO requests (staff_id, kind, body, date, date_to, days, in_time, out_time, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(me.id, kind, text, date, dateTo, days, tin, tout, 'pending', nowIso()).run();
      return json({ ok: true });
    }
    const id = idAt(1);
    if (id) {
      const r = await env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first();
      if (!r) return fail(404, 'not_found');
      if (method === 'PATCH') {
        if (!chief) return fail(403, 'chief_only');
        const b = await body(request);
        if (!b || !['approved', 'rejected'].includes(b.status)) return fail(422, 'status');
        if (r.status !== 'pending') return fail(409, 'decided');
        if (b.status === 'approved' && r.kind === 'correction') {
          // an approved correction clears the absence on that day and, when times were given, writes them as that day's attendance
          await env.DB.prepare('DELETE FROM absences WHERE staff_id = ? AND date = ?').bind(r.staff_id, r.date).run();
          if (r.in_time) {
            const inAt = riyadhIso(r.date, r.in_time), outAt = r.out_time ? riyadhIso(r.date, r.out_time) : null;
            const had = await env.DB.prepare('SELECT id, out_at FROM attendance WHERE staff_id = ? AND date = ? ORDER BY id LIMIT 1').bind(r.staff_id, r.date).first();
            if (had) await env.DB.prepare('UPDATE attendance SET in_at = ?, in_by = ?, out_at = COALESCE(?, out_at), out_by = CASE WHEN ? IS NULL THEN out_by ELSE ? END WHERE id = ?').bind(inAt, me.id, outAt, outAt, me.id, had.id).run();
            else await env.DB.prepare('INSERT INTO attendance (staff_id, date, in_at, out_at, in_by, out_by) VALUES (?, ?, ?, ?, ?, ?)').bind(r.staff_id, r.date, inAt, outAt, me.id, outAt ? me.id : null).run();
          }
        }
        if (b.status === 'approved' && r.kind === 'leave') {
          await env.DB.prepare('INSERT INTO leaves (staff_id, date_from, date_to, days, note, request_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(r.staff_id, r.date, r.date_to, r.days, clean(r.body, 200), r.id, me.id, nowIso()).run();
        }
        await env.DB.prepare('UPDATE requests SET status = ?, reply = ?, decided_at = ? WHERE id = ?').bind(b.status, clean(b.reply, 400), nowIso(), id).run();
        return json({ ok: true });
      }
      if (method === 'DELETE') {
        // the writer can withdraw a request that is still waiting; the head of management can delete any
        if (!chief && !(r.staff_id === me.id && r.status === 'pending')) return fail(403, 'chief_only');
        await env.DB.prepare('DELETE FROM requests WHERE id = ?').bind(id).run();
        return json({ ok: true });
      }
    }
  }
  return null;
}

// Removing a member takes their people-side records with them
export function hrDeleteStaff(env, id) {
  return [
    env.DB.prepare('DELETE FROM money WHERE staff_id = ?').bind(id),
    env.DB.prepare('DELETE FROM leaves WHERE staff_id = ?').bind(id),
    env.DB.prepare('DELETE FROM commissions WHERE staff_id = ?').bind(id),
    env.DB.prepare('DELETE FROM doc_chunks WHERE doc_id IN (SELECT id FROM docs WHERE staff_id = ?)').bind(id),
    env.DB.prepare('DELETE FROM docs WHERE staff_id = ?').bind(id),
    env.DB.prepare('DELETE FROM requests WHERE staff_id = ?').bind(id),
    env.DB.prepare('DELETE FROM devices WHERE staff_id = ?').bind(id),
  ];
}
