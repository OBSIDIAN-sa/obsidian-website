// OBSIDIAN DESIGN — staff system: ranks and what each may do, notifications, and the employee of the week.

// One flag per thing a rank can be allowed. The head of management has all of them, plus the powers no rank can hold
// (deleting, managing members and ranks, approving devices, deciding requests, the activity log).
export const PERMS = ['numbers', 'attendance_all', 'money', 'tasks_all', 'tasks_assign', 'leads_assign', 'assistant', 'note_kinds', 'edit', 'contacts', 'team_list'];
const all = (v) => Object.fromEntries(PERMS.map((k) => [k, v]));
export const ALL_PERMS = all(true);
const BUILTIN = [
  ['staff', 'موظف', { edit: true, contacts: true }],
  ['viewer', 'إداري', { numbers: true, tasks_all: true }],
  ['finance', 'محاسب', { numbers: true, attendance_all: true, money: true, edit: true, contacts: true }],
  ['admin', 'مدير', ALL_PERMS],
];

export const ROLES_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS roles (key TEXT PRIMARY KEY, name TEXT NOT NULL, perms TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 100)',
  `CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT,
     link TEXT, created_at TEXT NOT NULL, read_at TEXT)`,
  'CREATE INDEX IF NOT EXISTS notifications_staff ON notifications(staff_id, id)',
];
export const ROLES_COLUMNS = ['ALTER TABLE staff ADD COLUMN title TEXT'];

// the four starting ranks, written once
export async function seedRoles(env) {
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM roles').first();
  if (n.n) return;
  await env.DB.batch(BUILTIN.map((r, i) => env.DB.prepare('INSERT OR IGNORE INTO roles (key, name, perms, sort) VALUES (?, ?, ?, ?)').bind(r[0], r[1], JSON.stringify({ ...all(false), ...r[2] }), i)));
}
function parse(text) {
  let p = {};
  try { p = JSON.parse(text) || {}; } catch (e) {}
  return Object.fromEntries(PERMS.map((k) => [k, !!p[k]]));
}
export async function permsOf(env, role) {
  const row = await env.DB.prepare('SELECT perms FROM roles WHERE key = ?').bind(role || 'staff').first();
  return row ? parse(row.perms) : parse(JSON.stringify(BUILTIN[0][2]));
}

// A line in a member's notification list. `to` is one id or a list.
export async function notify(env, to, kind, title, text, link, nowIso) {
  const ids = [...new Set([].concat(to))].filter(Boolean);
  if (!ids.length) return;
  try {
    await env.DB.batch(ids.map((id) => env.DB.prepare('INSERT INTO notifications (staff_id, kind, title, body, link, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, kind, String(title).slice(0, 120), String(text || '').slice(0, 300), link || '', nowIso())));
  } catch (e) {}
}
export async function everyoneBut(env, id) {
  const rows = await env.DB.prepare('SELECT id FROM staff WHERE active = 1 AND id != ?').bind(id).all();
  return (rows.results || []).map((r) => r.id);
}
export async function chiefIds(env) {
  const rows = await env.DB.prepare("SELECT id FROM staff WHERE active = 1 AND (job = 'chief' OR (job IS NULL AND role = 'admin'))").all();
  return (rows.results || []).map((r) => r.id);
}

export async function rolesRoutes(c) {
  const { env, request, method, parts, me, chief, json, fail, clean, body, nowIso } = c;
  const top = parts[0];

  /* ---- ranks: the head of management names them and ticks what each may do ---- */
  if (top === 'roles') {
    if (method === 'GET') {
      const rows = (await env.DB.prepare('SELECT r.key, r.name, r.perms, (SELECT COUNT(*) FROM staff s WHERE s.role = r.key) AS members FROM roles r ORDER BY r.sort, r.name').all()).results || [];
      // everyone may read the names (to show their own rank); only the head of management sees the detail
      return json({ ok: true, roles: rows.map((r) => (chief ? { key: r.key, name: r.name, perms: parse(r.perms), members: r.members, builtin: BUILTIN.some((b) => b[0] === r.key) } : { key: r.key, name: r.name })) });
    }
    if (!chief) return fail(403, 'chief_only');
    const b = method === 'DELETE' ? {} : await body(request);
    if (!b) return fail(400, 'bad_request');
    const name = clean(b.name, 40);
    if (method === 'POST') {
      if (name.length < 2) return fail(422, 'name');
      const key = 'r' + Date.now().toString(36);
      await env.DB.prepare('INSERT INTO roles (key, name, perms, sort) VALUES (?, ?, ?, 100)').bind(key, name, JSON.stringify(parse(JSON.stringify(b.perms || {})))).run();
      return json({ ok: true, key });
    }
    const key = parts[1] || '';
    const row = await env.DB.prepare('SELECT key FROM roles WHERE key = ?').bind(key).first();
    if (!row) return fail(404, 'not_found');
    if (method === 'PATCH') {
      if (b.name !== undefined) { if (name.length < 2) return fail(422, 'name'); await env.DB.prepare('UPDATE roles SET name = ? WHERE key = ?').bind(name, key).run(); }
      if (b.perms !== undefined) await env.DB.prepare('UPDATE roles SET perms = ? WHERE key = ?').bind(JSON.stringify(parse(JSON.stringify(b.perms || {}))), key).run();
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      if (key === 'staff') return fail(422, 'role_base');
      // members on a deleted rank fall back to the plain member rank
      await env.DB.batch([env.DB.prepare("UPDATE staff SET role = 'staff' WHERE role = ?").bind(key), env.DB.prepare('DELETE FROM roles WHERE key = ?').bind(key)]);
      return json({ ok: true });
    }
  }

  /* ---- notifications: each member's own list ---- */
  if (top === 'notifications') {
    if (method === 'GET' && parts[1] === 'count') {
      const n = await env.DB.prepare('SELECT COUNT(*) AS n, MAX(id) AS last FROM notifications WHERE staff_id = ? AND read_at IS NULL').bind(me.id).first();
      const newest = n.last ? await env.DB.prepare('SELECT title, body FROM notifications WHERE id = ?').bind(n.last).first() : null;
      return json({ ok: true, unread: n.n, last: n.last || 0, newest });
    }
    if (method === 'GET') {
      const rows = await env.DB.prepare('SELECT id, kind, title, body, link, created_at, read_at FROM notifications WHERE staff_id = ? ORDER BY id DESC LIMIT 100').bind(me.id).all();
      return json({ ok: true, notifications: rows.results || [] });
    }
    if (method === 'POST' && parts[1] === 'read') {
      await env.DB.prepare('UPDATE notifications SET read_at = ? WHERE staff_id = ? AND read_at IS NULL').bind(nowIso(), me.id).run();
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      if (/^\d+$/.test(parts[1] || '')) await env.DB.prepare('DELETE FROM notifications WHERE id = ? AND staff_id = ?').bind(+parts[1], me.id).run();
      else await env.DB.prepare('DELETE FROM notifications WHERE staff_id = ?').bind(me.id).run();
      return json({ ok: true });
    }
  }

  /* ---- employee of the week, pinned on everyone's home page ---- */
  if (top === 'star') {
    if (method === 'GET') {
      const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'star'").first();
      let v = null;
      try { v = row && JSON.parse(row.value); } catch (e) {}
      if (!v) return json({ ok: true, star: null });
      const s = await env.DB.prepare('SELECT id, name, title, job FROM staff WHERE id = ?').bind(v.staff_id).first();
      return json({ ok: true, star: s ? { staff_id: s.id, name: s.name, title: s.title, job: s.job, chief: s.job === 'chief', note: v.note || '', since: v.since } : null });
    }
    if (!chief) return fail(403, 'chief_only');
    if (method === 'DELETE') { await env.DB.prepare("DELETE FROM settings WHERE key = 'star'").run(); return json({ ok: true }); }
    if (method === 'PUT') {
      const b = await body(request);
      const s = b && await env.DB.prepare('SELECT id, name FROM staff WHERE id = ? AND active = 1').bind(+b.staff_id || 0).first();
      if (!s) return fail(422, 'staff');
      const note = clean(b.note, 200);
      await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('star', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify({ staff_id: s.id, note, since: nowIso() })).run();
      await notify(env, await everyoneBut(env, me.id), 'star', 'موظف الأسبوع: ' + s.name, note, '#home', nowIso);
      return json({ ok: true });
    }
  }
  return null;
}
