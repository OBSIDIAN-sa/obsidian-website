// Obsidian Design bot — the whole API in one Pages Function.
// Bindings (see wrangler.toml): DB = D1 database, AI = Workers AI (optional: without it the chat falls back).
// Secrets: SETUP_KEY — needed once, to create the first admin account at /staff/.
import { HOURS, customerPrompt, staffPrompt } from '../_lib/kb.js';

const LEAD_STATUS = ['new', 'contacted', 'appointment', 'quoted', 'won', 'closed'];
const APPT_STATUS = ['pending', 'confirmed', 'done', 'cancelled', 'noshow'];
const SESSION_DAYS = 14;
const BOOK_AHEAD_DAYS = 14;
const DEFAULT_MODEL = '@cf/zai-org/glm-4.7-flash';

/* ------------------------------------------------------------------ helpers */
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
const fail = (status, error) => json({ ok: false, error }, status);

const nowIso = () => new Date().toISOString();
const epoch = () => Math.floor(Date.now() / 1000);
// Riyadh is UTC+3 all year
const riyadh = (d = new Date()) => new Date(d.getTime() + 3 * 3600 * 1000);
const ymd = (d) => d.toISOString().slice(0, 10);
const todayRiyadh = () => ymd(riyadh());
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}
const weekday = (dateStr) => new Date(dateStr + 'T00:00:00Z').getUTCDay();
const hh = (h) => String(h).padStart(2, '0') + ':00';

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function sha256(text) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return hex(a);
}
async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 },
    key,
    256
  );
  return hex(bits);
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const toLatinDigits = (s) =>
  String(s).replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x6f0));
// Saudi mobile → 05XXXXXXXX, or null
function normPhone(raw) {
  let p = toLatinDigits(raw || '').replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('966')) p = '0' + p.slice(3);
  if (/^5\d{8}$/.test(p)) p = '0' + p;
  return /^05\d{8}$/.test(p) ? p : null;
}
const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

async function body(request) {
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) return null;
  try {
    const text = await request.text();
    if (text.length > 20000) return null;
    const data = JSON.parse(text);
    return data && typeof data === 'object' ? data : null;
  } catch (e) {
    return null;
  }
}

// Fixed-window counter. Returns true while under the limit.
async function allow(env, request, bucket, limit, windowSec, extra = '') {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const key = await sha256(bucket + '|' + ip + '|' + extra);
  const now = epoch();
  const row = await env.DB.prepare('SELECT n, reset_at FROM rate WHERE key = ?').bind(key).first();
  if (!row || row.reset_at <= now) {
    await env.DB.prepare('INSERT INTO rate (key, n, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET n = 1, reset_at = excluded.reset_at')
      .bind(key, now + windowSec).run();
    return true;
  }
  if (row.n >= limit) return false;
  await env.DB.prepare('UPDATE rate SET n = n + 1 WHERE key = ?').bind(key).run();
  return true;
}
async function allowGlobal(env, bucket, limit, windowSec) {
  const key = 'global|' + bucket;
  const now = epoch();
  const row = await env.DB.prepare('SELECT n, reset_at FROM rate WHERE key = ?').bind(key).first();
  if (!row || row.reset_at <= now) {
    await env.DB.prepare('INSERT INTO rate (key, n, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET n = 1, reset_at = excluded.reset_at')
      .bind(key, now + windowSec).run();
    return true;
  }
  if (row.n >= limit) return false;
  await env.DB.prepare('UPDATE rate SET n = n + 1 WHERE key = ?').bind(key).run();
  return true;
}

/* ------------------------------------------------------------------ booking */
function firstBookable(env) {
  const today = todayRiyadh();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(env.BOOK_FROM || '') ? env.BOOK_FROM : today;
  return from > today ? from : today;
}
async function openDays(env) {
  const start = firstBookable(env);
  const end = addDays(start, BOOK_AHEAD_DAYS - 1);
  const taken = await env.DB.prepare(
    "SELECT date, time FROM appointments WHERE date BETWEEN ? AND ? AND status IN ('pending','confirmed')"
  ).bind(start, end).all();
  const busy = new Set((taken.results || []).map((r) => r.date + ' ' + r.time));
  const today = todayRiyadh();
  const nowHour = riyadh().getUTCHours();
  const days = [];
  for (let i = 0; i < BOOK_AHEAD_DAYS; i++) {
    const date = addDays(start, i);
    // today: only slots that start at least an hour from now
    const hours = (HOURS[weekday(date)] || []).filter((h) => date !== today || h > nowHour + 1);
    const slots = hours.map(hh).filter((t) => !busy.has(date + ' ' + t));
    if (slots.length) days.push({ date, slots });
  }
  return days;
}

async function saveLead(env, { name, phone, type, note, lang, source, status }) {
  const now = nowIso();
  const r = await env.DB.prepare(
    'INSERT INTO leads (created_at, updated_at, name, phone, type, note, lang, source, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(now, now, name, phone, type, note, lang, source, status || 'new').run();
  return r.meta.last_row_id;
}

/* ------------------------------------------------------------------ AI */
function aiText(out) {
  if (!out) return '';
  if (typeof out === 'string') return out;
  if (typeof out.response === 'string') return out.response;
  const c = out.choices && out.choices[0];
  if (c && c.message && typeof c.message.content === 'string') return c.message.content;
  if (typeof out.output_text === 'string') return out.output_text;
  return '';
}
let lastAiError = '';
async function askAI(env, system, messages, maxTokens) {
  lastAiError = env.AI ? 'empty reply' : 'no AI binding';
  if (!env.AI) return null;
  try {
    const out = await env.AI.run(env.AI_MODEL || DEFAULT_MODEL, {
      messages: [{ role: 'system', content: system }, ...messages],
      // the default model thinks before answering; thinking is off so the tokens go to the reply
      max_tokens: maxTokens + 600,
      temperature: 0.2,
      chat_template_kwargs: { enable_thinking: false },
    });
    let text = aiText(out).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!text) lastAiError = 'empty reply: ' + JSON.stringify(out).slice(0, 600);
    return text || null;
  } catch (e) {
    console.log('AI error', e && e.message);
    lastAiError = String((e && e.message) || e).slice(0, 300);
    return null;
  }
}
// Last line of defence for rule 2: a reply that names a price or a duration is dropped.
const PRICEY = /(\d[\d,.]*\s*(ريال|ر\.?\s?س|﷼|sar\b|riyals?\b|sr\b))|((ريال|sar)\s*\d)|(\d+\s*(يوم|أيام|ايام|أسبوع|اسبوع|أسابيع|اسابيع|شهر|أشهر|اشهر))|(\d+\s*(days?|weeks?|months?)\b)|(يومين|أسبوعين|اسبوعين|شهرين|خلال\s+(يوم|أسبوع|اسبوع|شهر))/i;

/* ------------------------------------------------------------------ auth */
function cookie(request, name) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}
function sessionCookie(request, token, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `obs_staff=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
async function currentStaff(env, request) {
  const token = cookie(request, 'obs_staff');
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const row = await env.DB.prepare(
    'SELECT s.id, s.username, s.name, s.role FROM sessions x JOIN staff s ON s.id = x.staff_id WHERE x.token_hash = ? AND x.expires_at > ? AND s.active = 1'
  ).bind(await sha256(token), epoch()).first();
  return row || null;
}
async function startSession(env, request, staffId) {
  const token = randomHex(32);
  await env.DB.prepare('INSERT INTO sessions (token_hash, staff_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), staffId, nowIso(), epoch() + SESSION_DAYS * 86400).run();
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(epoch()).run();
  return sessionCookie(request, token, SESSION_DAYS * 86400);
}
const validUsername = (u) => /^[a-z0-9._-]{3,30}$/.test(u);
const validPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 100;

/* ------------------------------------------------------------------ public routes */
async function publicRoutes(env, request, method, parts) {
  const route = parts.join('/');

  if (method === 'GET' && route === 'days') {
    return json({ ok: true, days: await openDays(env) });
  }

  if (method === 'POST' && route === 'leads') {
    const b = await body(request);
    if (!b) return fail(400, 'bad_request');
    if (b.hp) return json({ ok: true }); // honeypot: pretend it worked
    const name = clean(b.name, 80);
    const phone = normPhone(b.phone);
    if (name.length < 2) return fail(422, 'name');
    if (!phone) return fail(422, 'phone');
    if (!(await allow(env, request, 'lead', 6, 3600))) return fail(429, 'slow_down');
    const id = await saveLead(env, {
      name, phone, type: clean(b.type, 60), note: clean(b.note, 600), lang: b.lang === 'en' ? 'en' : 'ar', source: 'bot',
    });
    return json({ ok: true, id });
  }

  if (method === 'POST' && route === 'appointments') {
    const b = await body(request);
    if (!b) return fail(400, 'bad_request');
    if (b.hp) return json({ ok: true });
    const name = clean(b.name, 80);
    const phone = normPhone(b.phone);
    const date = clean(b.date, 10);
    const time = clean(b.time, 5);
    if (name.length < 2) return fail(422, 'name');
    if (!phone) return fail(422, 'phone');
    const day = (await openDays(env)).find((d) => d.date === date);
    if (!day || !day.slots.includes(time)) return fail(409, 'slot_taken');
    if (!(await allow(env, request, 'appt', 4, 3600))) return fail(429, 'slow_down');
    // one live booking per phone: stops the calendar being filled from one number
    const mine = await env.DB.prepare(
      "SELECT id FROM appointments WHERE phone = ? AND date >= ? AND status IN ('pending','confirmed')"
    ).bind(phone, todayRiyadh()).first();
    if (mine) return fail(409, 'already_booked');

    const lang = b.lang === 'en' ? 'en' : 'ar';
    let lead = await env.DB.prepare("SELECT id FROM leads WHERE phone = ? AND status IN ('new','contacted') ORDER BY id DESC LIMIT 1").bind(phone).first();
    let leadId;
    if (lead) {
      leadId = lead.id;
      await env.DB.prepare("UPDATE leads SET status = 'appointment', updated_at = ? WHERE id = ?").bind(nowIso(), leadId).run();
    } else {
      leadId = await saveLead(env, { name, phone, type: clean(b.type, 60), note: '', lang, source: 'bot', status: 'appointment' });
    }
    try {
      const r = await env.DB.prepare(
        'INSERT INTO appointments (created_at, lead_id, name, phone, date, time, note) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(nowIso(), leadId, name, phone, date, time, clean(b.note, 300)).run();
      return json({ ok: true, id: r.meta.last_row_id, date, time });
    } catch (e) {
      return fail(409, 'slot_taken'); // lost the race for the slot (unique index)
    }
  }

  if (method === 'POST' && route === 'chat') {
    const b = await body(request);
    if (!b || !Array.isArray(b.messages)) return fail(400, 'bad_request');
    const lang = b.lang === 'en' ? 'en' : 'ar';
    const messages = b.messages.slice(-8)
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: clean(m.content, 500) }))
      .filter((m) => m.content);
    if (!messages.length || messages[messages.length - 1].role !== 'user') return fail(400, 'bad_request');
    if (!(await allow(env, request, 'chat', 40, 86400))) return json({ ok: false, fallback: true, reason: 'limit' });
    if (!(await allowGlobal(env, 'chat', +(env.AI_DAILY_CAP || 250), 86400))) return json({ ok: false, fallback: true, reason: 'limit' });
    let reply = await askAI(env, customerPrompt(lang), messages, 220);
    if (!reply) return json({ ok: false, fallback: true, reason: 'ai', ...(env.DEBUG_AI === '1' ? { detail: lastAiError } : {}) });
    let action = null;
    reply = reply.replace(/\[\[(book|lead|whatsapp)\]\]/gi, (m, a) => { action = a.toLowerCase(); return ''; }).replace(/\[\[[^\]]*\]\]/g, '').trim();
    if (PRICEY.test(toLatinDigits(reply))) return json({ ok: false, fallback: true, reason: 'guard', intent: 'price' });
    return json({ ok: true, reply: reply.slice(0, 900), action });
  }

  return null;
}

/* ------------------------------------------------------------------ staff routes */
async function leadCard(env, id) {
  const lead = await env.DB.prepare(
    'SELECT l.*, s.name AS assigned_name FROM leads l LEFT JOIN staff s ON s.id = l.assigned_to WHERE l.id = ?'
  ).bind(id).first();
  if (!lead) return null;
  const notes = await env.DB.prepare(
    'SELECT n.id, n.body, n.created_at, s.name AS staff_name FROM lead_notes n LEFT JOIN staff s ON s.id = n.staff_id WHERE n.lead_id = ? ORDER BY n.id DESC LIMIT 30'
  ).bind(id).all();
  const appts = await env.DB.prepare('SELECT id, date, time, status, note FROM appointments WHERE lead_id = ? ORDER BY date DESC, time DESC LIMIT 10').bind(id).all();
  return { ...lead, notes: notes.results || [], appointments: appts.results || [] };
}

async function summary(env) {
  const today = todayRiyadh();
  const byStatus = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM leads GROUP BY status').all();
  const counts = {};
  LEAD_STATUS.forEach((s) => (counts[s] = 0));
  (byStatus.results || []).forEach((r) => (counts[r.status] = r.n));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const week = await env.DB.prepare('SELECT COUNT(*) AS n FROM leads WHERE created_at >= ?').bind(weekAgo).first();
  const todayAppts = await env.DB.prepare("SELECT COUNT(*) AS n FROM appointments WHERE date = ? AND status IN ('pending','confirmed')").bind(today).first();
  const upcoming = await env.DB.prepare("SELECT COUNT(*) AS n FROM appointments WHERE date > ? AND status IN ('pending','confirmed')").bind(today).first();
  const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM appointments WHERE date >= ? AND status = 'pending'").bind(today).first();
  return { counts, total, week: week.n, today_appointments: todayAppts.n, upcoming_appointments: upcoming.n, pending_appointments: pending.n, today };
}

async function staffRoutes(env, request, method, parts) {
  const route = parts.join('/');

  /* ---- no session needed ---- */
  if (method === 'GET' && route === 'me') {
    const user = await currentStaff(env, request);
    if (user) return json({ ok: true, user });
    const any = await env.DB.prepare('SELECT COUNT(*) AS n FROM staff').first();
    return json({ ok: true, user: null, needs_setup: any.n === 0 });
  }

  if (method === 'POST' && route === 'setup') {
    const b = await body(request);
    if (!b) return fail(400, 'bad_request');
    if (!(await allow(env, request, 'setup', 6, 900))) return fail(429, 'slow_down');
    const any = await env.DB.prepare('SELECT COUNT(*) AS n FROM staff').first();
    if (any.n > 0) return fail(403, 'already_set_up');
    if (!env.SETUP_KEY || !safeEqual(await sha256(String(b.key || '')), await sha256(env.SETUP_KEY))) return fail(403, 'setup_key');
    const username = clean(b.username, 30).toLowerCase();
    const name = clean(b.name, 60);
    if (!validUsername(username)) return fail(422, 'username');
    if (name.length < 2) return fail(422, 'name');
    if (!validPassword(b.password)) return fail(422, 'password');
    const salt = randomHex(16);
    const r = await env.DB.prepare("INSERT INTO staff (username, name, role, pass_hash, pass_salt, created_at) VALUES (?, ?, 'admin', ?, ?, ?)")
      .bind(username, name, await hashPassword(b.password, salt), salt, nowIso()).run();
    return json({ ok: true }, 200, { 'Set-Cookie': await startSession(env, request, r.meta.last_row_id) });
  }

  if (method === 'POST' && route === 'login') {
    const b = await body(request);
    if (!b) return fail(400, 'bad_request');
    const username = clean(b.username, 30).toLowerCase();
    if (!(await allow(env, request, 'login', 8, 900, username))) return fail(429, 'slow_down');
    const row = await env.DB.prepare('SELECT * FROM staff WHERE username = ? AND active = 1').bind(username).first();
    // hash even when the user doesn't exist, so timing doesn't reveal usernames
    const hash = await hashPassword(String(b.password || ''), row ? row.pass_salt : 'no-such-user-salt');
    if (!row || !safeEqual(hash, row.pass_hash)) return fail(401, 'credentials');
    return json({ ok: true, user: { id: row.id, username: row.username, name: row.name, role: row.role } }, 200, {
      'Set-Cookie': await startSession(env, request, row.id),
    });
  }

  if (method === 'POST' && route === 'logout') {
    const token = cookie(request, 'obs_staff');
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, '', 0) });
  }

  /* ---- everything below needs a session ---- */
  const me = await currentStaff(env, request);
  if (!me) return fail(401, 'login_required');

  if (method === 'GET' && route === 'summary') return json({ ok: true, summary: await summary(env) });

  /* ---- attendance: check-in / check-out; an admin can take attendance for anyone ---- */
  if (parts[0] === 'attendance') {
    const today = todayRiyadh();
    const minutes = (r) => (r.out_at ? Math.max(0, Math.round((Date.parse(r.out_at) - Date.parse(r.in_at)) / 60000)) : 0);

    if (method === 'POST' && (parts[1] === 'in' || parts[1] === 'out')) {
      const b = (await body(request)) || {};
      let target = me.id;
      if (b.staff_id !== undefined && +b.staff_id !== me.id) {
        if (me.role !== 'admin') return fail(403, 'admin_only');
        const s = await env.DB.prepare('SELECT id FROM staff WHERE id = ? AND active = 1').bind(+b.staff_id).first();
        if (!s) return fail(422, 'staff');
        target = s.id;
      }
      const open = await env.DB.prepare('SELECT id FROM attendance WHERE staff_id = ? AND date = ? AND out_at IS NULL ORDER BY id DESC LIMIT 1').bind(target, today).first();
      if (parts[1] === 'in') {
        if (open) return fail(409, 'already_in');
        await env.DB.prepare('INSERT INTO attendance (staff_id, date, in_at, in_by) VALUES (?, ?, ?, ?)').bind(target, today, nowIso(), me.id).run();
      } else {
        if (!open) return fail(409, 'not_in');
        await env.DB.prepare('UPDATE attendance SET out_at = ?, out_by = ? WHERE id = ?').bind(nowIso(), me.id, open.id).run();
      }
      return json({ ok: true });
    }

    if (method === 'GET' && parts.length === 1) {
      const url = new URL(request.url);
      const ok = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
      const from = ok(url.searchParams.get('from')) ? url.searchParams.get('from') : today;
      const to = ok(url.searchParams.get('to')) ? url.searchParams.get('to') : today;
      const all = me.role === 'admin' && url.searchParams.get('all') === '1';
      const rows = await env.DB.prepare(
        'SELECT a.id, a.staff_id, a.date, a.in_at, a.out_at, a.in_by, a.out_by, s.name FROM attendance a JOIN staff s ON s.id = a.staff_id WHERE a.date BETWEEN ? AND ?' +
        (all ? '' : ' AND a.staff_id = ?') + ' ORDER BY a.date DESC, a.in_at DESC LIMIT 800'
      ).bind(...(all ? [from, to] : [from, to, me.id])).all();
      const records = (rows.results || []).map((r) => ({ ...r, minutes: minutes(r), by_admin: r.in_by !== r.staff_id || (r.out_by != null && r.out_by !== r.staff_id) }));
      let staff = [];
      if (all) staff = (await env.DB.prepare('SELECT id, name FROM staff WHERE active = 1 ORDER BY id').all()).results || [];
      return json({ ok: true, today, from, to, records, staff });
    }
  }


  if (method === 'GET' && route === 'leads') {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || '';
    const q = clean(url.searchParams.get('q'), 60);
    const where = [];
    const args = [];
    if (LEAD_STATUS.includes(status)) { where.push('l.status = ?'); args.push(status); }
    if (status === 'open') where.push("l.status NOT IN ('won','closed')");
    if (url.searchParams.get('mine') === '1') { where.push('l.assigned_to = ?'); args.push(me.id); }
    if (q) {
      const digits = toLatinDigits(q).replace(/\D/g, '');
      if (/^#\d{1,6}$/.test(q) || /^\d{1,3}$/.test(q)) { where.push('l.id = ?'); args.push(+digits); }
      else if (digits.length >= 4) { where.push('l.phone LIKE ?'); args.push('%' + digits.replace(/^966/, '').replace(/^0/, '') + '%'); }
      else { where.push('l.name LIKE ?'); args.push('%' + q.replace(/[%_]/g, '') + '%'); }
    }
    const rows = await env.DB.prepare(
      'SELECT l.id, l.created_at, l.name, l.phone, l.type, l.note, l.status, l.source, l.assigned_to, s.name AS assigned_name FROM leads l LEFT JOIN staff s ON s.id = l.assigned_to' +
      (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY l.id DESC LIMIT 40'
    ).bind(...args).all();
    return json({ ok: true, leads: rows.results || [] });
  }

  if (method === 'POST' && route === 'leads') {
    const b = await body(request);
    if (!b) return fail(400, 'bad_request');
    const name = clean(b.name, 80);
    const phone = normPhone(b.phone);
    if (name.length < 2) return fail(422, 'name');
    if (!phone) return fail(422, 'phone');
    const id = await saveLead(env, { name, phone, type: clean(b.type, 60), note: clean(b.note, 600), lang: 'ar', source: 'staff' });
    return json({ ok: true, lead: await leadCard(env, id) });
  }

  if (parts[0] === 'leads' && /^\d+$/.test(parts[1] || '')) {
    const id = +parts[1];
    if (method === 'GET' && parts.length === 2) {
      const lead = await leadCard(env, id);
      return lead ? json({ ok: true, lead }) : fail(404, 'not_found');
    }
    if (method === 'PATCH' && parts.length === 2) {
      const b = await body(request);
      if (!b) return fail(400, 'bad_request');
      const sets = [];
      const args = [];
      if (b.status !== undefined) {
        if (!LEAD_STATUS.includes(b.status)) return fail(422, 'status');
        sets.push('status = ?'); args.push(b.status);
      }
      if (b.assigned_to !== undefined) {
        if (b.assigned_to === null) sets.push('assigned_to = NULL');
        else {
          const s = await env.DB.prepare('SELECT id FROM staff WHERE id = ? AND active = 1').bind(+b.assigned_to).first();
          if (!s) return fail(422, 'assigned_to');
          sets.push('assigned_to = ?'); args.push(s.id);
        }
      }
      if (!sets.length) return fail(400, 'bad_request');
      sets.push('updated_at = ?'); args.push(nowIso());
      const r = await env.DB.prepare('UPDATE leads SET ' + sets.join(', ') + ' WHERE id = ?').bind(...args, id).run();
      if (!r.meta.changes) return fail(404, 'not_found');
      return json({ ok: true, lead: await leadCard(env, id) });
    }
    if (method === 'POST' && parts[2] === 'notes') {
      const b = await body(request);
      const text = clean(b && b.body, 800);
      if (!text) return fail(422, 'body');
      const exists = await env.DB.prepare('SELECT id FROM leads WHERE id = ?').bind(id).first();
      if (!exists) return fail(404, 'not_found');
      await env.DB.prepare('INSERT INTO lead_notes (lead_id, staff_id, body, created_at) VALUES (?, ?, ?, ?)').bind(id, me.id, text, nowIso()).run();
      await env.DB.prepare('UPDATE leads SET updated_at = ? WHERE id = ?').bind(nowIso(), id).run();
      return json({ ok: true, lead: await leadCard(env, id) });
    }
  }

  if (method === 'GET' && route === 'appointments') {
    const range = new URL(request.url).searchParams.get('range') || 'upcoming';
    const today = todayRiyadh();
    let sql = 'SELECT a.*, l.type AS lead_type, l.status AS lead_status FROM appointments a LEFT JOIN leads l ON l.id = a.lead_id WHERE ';
    let args;
    if (range === 'today') { sql += 'a.date = ?'; args = [today]; }
    else if (range === 'week') { sql += 'a.date BETWEEN ? AND ?'; args = [today, addDays(today, 6)]; }
    else if (range === 'past') { sql += 'a.date < ?'; args = [today]; }
    else { sql += 'a.date >= ?'; args = [today]; }
    sql += range === 'past' ? ' ORDER BY a.date DESC, a.time DESC LIMIT 40' : ' ORDER BY a.date, a.time LIMIT 60';
    const rows = await env.DB.prepare(sql).bind(...args).all();
    return json({ ok: true, appointments: rows.results || [], today });
  }

  if (method === 'PATCH' && parts[0] === 'appointments' && /^\d+$/.test(parts[1] || '')) {
    const b = await body(request);
    if (!b || !APPT_STATUS.includes(b.status)) return fail(422, 'status');
    try {
      const r = await env.DB.prepare('UPDATE appointments SET status = ? WHERE id = ?').bind(b.status, +parts[1]).run();
      if (!r.meta.changes) return fail(404, 'not_found');
    } catch (e) {
      return fail(409, 'slot_taken'); // re-opening a cancelled booking whose slot has since been taken
    }
    const row = await env.DB.prepare('SELECT * FROM appointments WHERE id = ?').bind(+parts[1]).first();
    return json({ ok: true, appointment: row });
  }

  if (method === 'POST' && route === 'password') {
    const b = await body(request);
    if (!b || !validPassword(b.new_password)) return fail(422, 'password');
    const row = await env.DB.prepare('SELECT pass_hash, pass_salt FROM staff WHERE id = ?').bind(me.id).first();
    if (!safeEqual(await hashPassword(String(b.password || ''), row.pass_salt), row.pass_hash)) return fail(401, 'credentials');
    const salt = randomHex(16);
    await env.DB.prepare('UPDATE staff SET pass_hash = ?, pass_salt = ? WHERE id = ?').bind(await hashPassword(b.new_password, salt), salt, me.id).run();
    return json({ ok: true });
  }

  if (method === 'GET' && route === 'users') {
    const rows = await env.DB.prepare('SELECT id, username, name, role, active FROM staff ORDER BY id').all();
    return json({ ok: true, users: rows.results || [] });
  }

  if (route === 'users' || parts[0] === 'users') {
    if (me.role !== 'admin') return fail(403, 'admin_only');
    if (method === 'POST' && route === 'users') {
      const b = await body(request);
      if (!b) return fail(400, 'bad_request');
      const username = clean(b.username, 30).toLowerCase();
      const name = clean(b.name, 60);
      if (!validUsername(username)) return fail(422, 'username');
      if (name.length < 2) return fail(422, 'name');
      if (!validPassword(b.password)) return fail(422, 'password');
      const salt = randomHex(16);
      try {
        await env.DB.prepare('INSERT INTO staff (username, name, role, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(username, name, b.role === 'admin' ? 'admin' : 'staff', await hashPassword(b.password, salt), salt, nowIso()).run();
      } catch (e) {
        return fail(409, 'username_taken');
      }
      return json({ ok: true });
    }
    if (method === 'PATCH' && /^\d+$/.test(parts[1] || '')) {
      const id = +parts[1];
      const b = await body(request);
      if (!b) return fail(400, 'bad_request');
      if (b.active !== undefined) {
        if (id === me.id) return fail(422, 'self');
        await env.DB.prepare('UPDATE staff SET active = ? WHERE id = ?').bind(b.active ? 1 : 0, id).run();
        if (!b.active) await env.DB.prepare('DELETE FROM sessions WHERE staff_id = ?').bind(id).run();
      }
      if (b.password !== undefined) {
        if (!validPassword(b.password)) return fail(422, 'password');
        const salt = randomHex(16);
        await env.DB.prepare('UPDATE staff SET pass_hash = ?, pass_salt = ? WHERE id = ?').bind(await hashPassword(b.password, salt), salt, id).run();
        await env.DB.prepare('DELETE FROM sessions WHERE staff_id = ?').bind(id).run();
      }
      return json({ ok: true });
    }
  }

  if (method === 'POST' && route === 'ask') {
    const b = await body(request);
    const question = clean(b && b.question, 500);
    if (!question) return fail(400, 'bad_request');
    if (!(await allow(env, request, 'ask', 60, 86400, String(me.id)))) return json({ ok: false, fallback: true });
    const s = await summary(env);
    const leads = await env.DB.prepare(
      'SELECT l.id, l.created_at, l.name, l.phone, l.type, l.note, l.status, s.name AS assigned FROM leads l LEFT JOIN staff s ON s.id = l.assigned_to ORDER BY l.id DESC LIMIT 40'
    ).all();
    const appts = await env.DB.prepare(
      "SELECT id, lead_id, name, phone, date, time, status FROM appointments WHERE date >= ? ORDER BY date, time LIMIT 40"
    ).bind(s.today).all();
    const data =
      `TODAY (Riyadh): ${s.today}\n` +
      `REQUEST COUNTS BY STATUS: ${JSON.stringify(s.counts)} (total ${s.total}, new in last 7 days ${s.week})\n` +
      `STATUS MEANINGS: new=جديد, contacted=تم التواصل, appointment=موعد, quoted=عرض سعر, won=تعاقد, closed=مغلق\n` +
      `LATEST REQUESTS (newest first):\n` +
      (leads.results || []).map((l) => `#${l.id} | ${l.created_at.slice(0, 10)} | ${l.name} | ${l.phone} | ${l.type || '-'} | ${l.status} | assigned: ${l.assigned || '-'} | note: ${(l.note || '-').slice(0, 120)}`).join('\n') +
      `\nAPPOINTMENTS FROM TODAY ON:\n` +
      ((appts.results || []).map((a) => `${a.date} ${a.time} | ${a.name} | ${a.phone} | ${a.status} | request #${a.lead_id || '-'}`).join('\n') || 'none');
    const reply = await askAI(env, staffPrompt() + '\n\nDATA:\n' + data, [{ role: 'user', content: question }], 350);
    if (!reply) return json({ ok: false, fallback: true });
    return json({ ok: true, reply: reply.slice(0, 1500) });
  }

  return null;
}

/* ------------------------------------------------------------------ entry */
export async function onRequest({ request, env, params }) {
  const method = request.method;
  const parts = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  if (!env.DB) return fail(503, 'not_configured');

  // Same-origin only for anything that changes state (the session cookie is SameSite=Strict as well)
  if (method !== 'GET') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) return fail(403, 'origin');
  }

  try {
    const res = parts[0] === 'staff'
      ? await staffRoutes(env, request, method, parts.slice(1))
      : await publicRoutes(env, request, method, parts);
    return res || fail(404, 'not_found');
  } catch (e) {
    console.log('API error', e && e.stack);
    return fail(500, 'server');
  }
}
