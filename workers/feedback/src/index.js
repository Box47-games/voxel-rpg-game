/**
 * Riftholm feedback Worker.
 *
 *   POST /api/feedback   the game sends { rating, category, message, context, screenshot }
 *   GET  /admin          private list of feedback (HTTP Basic auth, password = ADMIN_TOKEN)
 *   GET  /admin/shot/:id a feedback screenshot
 *   GET  /admin/export   everything as JSON (no screenshots)
 *
 * Feedback is stored in a SQLite-backed Durable Object (one instance, "main").
 * Players' IPs are never stored: only a salted hash, for rate limiting.
 */

export const CATEGORIES = ['bug', 'idea', 'balance', 'art', 'other'];
export const MAX_MESSAGE = 2000;
export const MAX_CONTEXT = 4000; // characters of JSON
export const MAX_SHOT_BYTES = 600 * 1024;
export const RATE_LIMIT = { count: 5, minutes: 10 };

const ALLOWED_ORIGINS = [/^https:\/\/box47-games\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];

export function corsHeaders(origin) {
  const ok = origin && ALLOWED_ORIGINS.some((re) => re.test(origin));
  return ok
    ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    }
    : { Vary: 'Origin' };
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Check and clean a submission.
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function validateFeedback(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Bad request' };
  if (body.website) return { ok: false, error: 'Bad request' }; // honeypot
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return { ok: false, error: 'Please write a message' };
  if (message.length > MAX_MESSAGE) return { ok: false, error: `Message is over ${MAX_MESSAGE} characters` };
  const category = CATEGORIES.includes(body.category) ? body.category : 'other';
  let rating = null;
  if (body.rating != null) {
    const r = Number(body.rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) return { ok: false, error: 'Rating must be 1 to 5' };
    rating = r;
  }
  let context = '{}';
  if (body.context != null) {
    context = JSON.stringify(body.context);
    if (context.length > MAX_CONTEXT) return { ok: false, error: 'Context too large' };
  }
  let shot = null;
  let shotType = null;
  if (body.screenshot) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.screenshot));
    if (!m) return { ok: false, error: 'Screenshot must be a JPEG, PNG or WebP data URL' };
    // Kept as base64 until it is stored (bytes don't survive JSON)
    const bytes = Math.floor((m[2].length * 3) / 4) - (m[2].endsWith('==') ? 2 : m[2].endsWith('=') ? 1 : 0);
    if (bytes > MAX_SHOT_BYTES) return { ok: false, error: 'Screenshot too large' };
    shot = m[2];
    shotType = m[1];
  }
  return { ok: true, value: { rating, category, message, context, shot, shotType } };
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Constant-time string compare (for the admin password). */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAdmin(request, env) {
  if (!env.ADMIN_TOKEN) return false;
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Basic ')) return false;
  let decoded = '';
  try { decoded = atob(auth.slice(6)); } catch { return false; }
  const password = decoded.slice(decoded.indexOf(':') + 1);
  return safeEqual(password, env.ADMIN_TOKEN);
}

async function hashIp(ip, salt) {
  const data = new TextEncoder().encode(`${salt}|${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function adminPage(rows) {
  const stars = (r) => (r ? '★'.repeat(r) + '☆'.repeat(5 - r) : '—');
  const items = rows.map((r) => {
    let ctx = {};
    try { ctx = JSON.parse(r.context || '{}'); } catch { /* keep empty */ }
    const ctxText = Object.entries(ctx).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
    return `<article>
  <header><span class="cat cat-${escapeHtml(r.category)}">${escapeHtml(r.category)}</span>
  <span class="stars">${stars(r.rating)}</span><time>${escapeHtml(r.created_at)}</time><span class="id">#${r.id}</span></header>
  <p>${escapeHtml(r.message).replace(/\n/g, '<br>')}</p>
  ${r.has_shot ? `<a href="/admin/shot/${r.id}" target="_blank"><img src="/admin/shot/${r.id}" alt="Screenshot ${r.id}" loading="lazy"></a>` : ''}
  <footer>${escapeHtml(ctxText)}</footer>
</article>`;
  }).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Riftholm feedback</title><style>
:root{color-scheme:light dark;--bg:#f5f3ee;--card:#fff;--text:#222;--dim:#666;--edge:#ddd}
@media (prefers-color-scheme:dark){:root{--bg:#14161c;--card:#1d2029;--text:#eee;--dim:#9a9a9a;--edge:#333}}
body{margin:0;padding:16px;background:var(--bg);color:var(--text);font:15px/1.45 system-ui,sans-serif}
main{max-width:860px;margin:0 auto}h1{font-size:1.4rem;margin:0 0 4px}.sub{color:var(--dim);margin:0 0 16px}
article{background:var(--card);border:1px solid var(--edge);border-radius:8px;padding:12px 14px;margin:0 0 12px}
header{display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:13px;color:var(--dim)}
.cat{font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text)}.stars{color:#d9a21b}.id{margin-left:auto}
p{margin:8px 0;white-space:normal;overflow-wrap:anywhere}img{max-width:100%;border-radius:6px;border:1px solid var(--edge)}
footer{font-size:12px;color:var(--dim);overflow-wrap:anywhere;margin-top:6px}
</style></head><body><main><h1>Riftholm feedback</h1>
<p class="sub">${rows.length} most recent · <a href="/admin/export">JSON export</a></p>
${items || '<p>No feedback yet.</p>'}</main></body></html>`;
}

/** SQLite-backed store: one instance holds all feedback. */
export class FeedbackStore {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      rating INTEGER,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      context TEXT NOT NULL,
      shot BLOB,
      shot_type TEXT,
      ip_hash TEXT
    )`);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/add' && request.method === 'POST') {
      const { value, ipHash } = await request.json();
      const since = new Date(Date.now() - RATE_LIMIT.minutes * 60000).toISOString();
      const recent = this.sql.exec('SELECT COUNT(*) AS n FROM feedback WHERE ip_hash = ? AND created_at > ?', ipHash, since).one().n;
      if (recent >= RATE_LIMIT.count) return json({ ok: false, error: 'Too much feedback at once: try again in a few minutes' }, 429);
      const shot = value.shot ? base64ToBytes(value.shot) : null;
      const row = this.sql.exec(
        'INSERT INTO feedback (created_at, rating, category, message, context, shot, shot_type, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
        new Date().toISOString(), value.rating, value.category, value.message, value.context,
        shot ? shot.buffer : null, value.shotType, ipHash
      ).one();
      return json({ ok: true, id: row.id });
    }
    if (url.pathname === '/list') {
      const rows = this.sql.exec(
        'SELECT id, created_at, rating, category, message, context, shot IS NOT NULL AS has_shot FROM feedback ORDER BY id DESC LIMIT 200'
      ).toArray();
      return json(rows);
    }
    const shotMatch = /^\/shot\/(\d+)$/.exec(url.pathname);
    if (shotMatch) {
      const rows = this.sql.exec('SELECT shot, shot_type FROM feedback WHERE id = ?', Number(shotMatch[1])).toArray();
      if (!rows.length || !rows[0].shot) return new Response('Not found', { status: 404 });
      return new Response(rows[0].shot, { headers: { 'Content-Type': rows[0].shot_type || 'image/jpeg' } });
    }
    return new Response('Not found', { status: 404 });
  }
}

const storeOf = (env) => env.FEEDBACK.get(env.FEEDBACK.idFromName('main'));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin);

    if (url.pathname === '/api/feedback') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405, cors);
      if (!cors['Access-Control-Allow-Origin']) return json({ ok: false, error: 'Origin not allowed' }, 403, cors);
      if (Number(request.headers.get('Content-Length') || 0) > 1024 * 1024) return json({ ok: false, error: 'Too large' }, 413, cors);
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: 'Bad JSON' }, 400, cors); }
      const check = validateFeedback(body);
      if (!check.ok) return json(check, 400, cors);
      const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') || 'unknown', env.ADMIN_TOKEN || 'salt');
      const res = await storeOf(env).fetch('https://store/add', { method: 'POST', body: JSON.stringify({ value: check.value, ipHash }) });
      return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json', ...cors } });
    }

    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
      if (!isAdmin(request, env)) {
        return new Response('Sign in to read feedback', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Riftholm feedback", charset="UTF-8"' } });
      }
      const priv = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };
      if (url.pathname === '/admin') {
        const rows = await (await storeOf(env).fetch('https://store/list')).json();
        return new Response(adminPage(rows), { headers: { 'Content-Type': 'text/html; charset=utf-8', ...priv } });
      }
      if (url.pathname === '/admin/export') {
        const res = await storeOf(env).fetch('https://store/list');
        return new Response(res.body, { headers: { 'Content-Type': 'application/json', ...priv } });
      }
      const shot = /^\/admin\/shot\/(\d+)$/.exec(url.pathname);
      if (shot) {
        const res = await storeOf(env).fetch(`https://store/shot/${shot[1]}`);
        return new Response(res.body, { status: res.status, headers: { 'Content-Type': res.headers.get('Content-Type') || 'image/jpeg', ...priv } });
      }
    }

    return new Response('Riftholm feedback service', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  },
};
