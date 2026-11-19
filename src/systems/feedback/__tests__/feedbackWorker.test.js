/**
 * The feedback Worker's request handling, with a fake Durable Object store
 * (an in-memory SQL stand-in for the few queries it runs).
 */
import worker, { validateFeedback, corsHeaders, escapeHtml, isAdmin, FeedbackStore, MAX_MESSAGE } from '../../../../workers/feedback/src/index.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** Minimal stand-in for ctx.storage.sql covering FeedbackStore's statements. */
function fakeSql() {
  const rows = [];
  return {
    rows,
    exec(query, ...args) {
      let result = [];
      if (query.startsWith('CREATE')) result = [];
      else if (query.startsWith('SELECT COUNT')) result = [{ n: rows.filter((r) => r.ip_hash === args[0] && r.created_at > args[1]).length }];
      else if (query.startsWith('INSERT')) {
        const [created_at, rating, category, message, context, shot, shot_type, ip_hash] = args;
        const row = { id: rows.length + 1, created_at, rating, category, message, context, shot, shot_type, ip_hash };
        rows.push(row);
        result = [{ id: row.id }];
      } else if (query.startsWith('SELECT id, created_at')) {
        result = [...rows].reverse().map((r) => ({ id: r.id, created_at: r.created_at, rating: r.rating, category: r.category, message: r.message, context: r.context, has_shot: r.shot ? 1 : 0 }));
      } else if (query.startsWith('SELECT shot')) result = rows.filter((r) => r.id === args[0]);
      return { one: () => result[0], toArray: () => result };
    },
  };
}

function makeEnv() {
  const sql = fakeSql();
  const store = new FeedbackStore({ storage: { sql } }, {});
  return {
    sql,
    env: {
      ADMIN_TOKEN: 'secret-token',
      FEEDBACK: { idFromName: () => 'main', get: () => ({ fetch: (u, init) => store.fetch(new Request(u, init)) }) },
    },
  };
}

const post = (body, origin = 'https://box47-games.github.io') => new Request('https://fb.example/api/feedback', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': '1.2.3.4' }, body: JSON.stringify(body),
});
const basic = (pw) => ({ Authorization: `Basic ${btoa(`admin:${pw}`)}` });

describe('validateFeedback', () => {
  test('needs a message; cleans rating and category', () => {
    expect(validateFeedback({ message: '  ' }).ok).toBe(false);
    expect(validateFeedback({ message: 'x'.repeat(MAX_MESSAGE + 1) }).ok).toBe(false);
    expect(validateFeedback({ message: 'hi', rating: 9 }).ok).toBe(false);
    const ok = validateFeedback({ message: ' hi ', rating: 4, category: 'nope' });
    expect(ok).toMatchObject({ ok: true, value: { message: 'hi', rating: 4, category: 'other' } });
    expect(validateFeedback({ message: 'hi', website: 'spam' }).ok).toBe(false); // honeypot
  });

  test('screenshots must be image data URLs', () => {
    expect(validateFeedback({ message: 'hi', screenshot: 'javascript:alert(1)' }).ok).toBe(false);
    expect(validateFeedback({ message: 'hi', screenshot: PNG }).value.shotType).toBe('image/png');
  });
});

describe('the Worker', () => {
  test('only the game and localhost may post', () => {
    expect(corsHeaders('https://box47-games.github.io')['Access-Control-Allow-Origin']).toBe('https://box47-games.github.io');
    expect(corsHeaders('http://localhost:3000')['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
    expect(corsHeaders('https://evil.example')['Access-Control-Allow-Origin']).toBeUndefined();
  });

  test('stores feedback, rate limits, and shows it only to the admin', async () => {
    const { env, sql } = makeEnv();
    const res = await worker.fetch(post({ rating: 5, category: 'bug', message: 'Slime <b>stuck</b>', context: { level: 3 }, screenshot: PNG }), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: 1 });
    expect(sql.rows[0].ip_hash).not.toContain('1.2.3.4'); // never the raw IP

    const blocked = await worker.fetch(post({ message: 'hi' }, 'https://evil.example'), env);
    expect(blocked.status).toBe(403);

    for (let i = 0; i < 4; i++) await worker.fetch(post({ message: `more ${i}` }), env);
    expect((await worker.fetch(post({ message: 'one too many' }), env)).status).toBe(429);

    expect((await worker.fetch(new Request('https://fb.example/admin'), env)).status).toBe(401);
    expect((await worker.fetch(new Request('https://fb.example/admin', { headers: basic('wrong') }), env)).status).toBe(401);
    const page = await worker.fetch(new Request('https://fb.example/admin', { headers: basic('secret-token') }), env);
    const html = await page.text();
    expect(html).toContain('Slime &lt;b&gt;stuck&lt;/b&gt;'); // escaped
    expect(html).toContain('/admin/shot/1');
    const shot = await worker.fetch(new Request('https://fb.example/admin/shot/1', { headers: basic('secret-token') }), env);
    expect(shot.headers.get('Content-Type')).toBe('image/png');
    expect((await shot.arrayBuffer()).byteLength).toBeGreaterThan(50);
  });

  test('helpers', () => {
    expect(escapeHtml('<a href="x">\'&')).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
    expect(isAdmin(new Request('https://x/admin', { headers: basic('t') }), { ADMIN_TOKEN: 't' })).toBe(true);
    expect(isAdmin(new Request('https://x/admin', { headers: basic('t') }), {})).toBe(false);
  });
});
