// Feedback reaches the cloud through POST /api/feedback (worker/index.js,
// flarepress's shared handleFeedback in worker/events-worker.js): from the
// site's own origin only, stored in R2 as sent under v1/noodlepads/, with
// nothing of the sender. site/wrangler.toml binds the shared bucket and the
// rate limit. The vendored copy's sha is checked in events-route.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { FEEDBACK_OPTS } from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const TEXT = 'The kids love the burp pad. Could Beats have a cowbell? 🐄';

// The shared bucket and the rate limit, as stand-ins: what was put, and what the limiter was asked.
function bindings({ allow = () => true } = {}) {
  const put = [];
  const asked = [];
  return {
    put,
    asked,
    FEEDBACK: { put: async (key, body, opts) => { put.push({ key, body: new TextDecoder().decode(body), opts }); } },
    FEEDBACK_LIMITER: { limit: async (o) => { asked.push(o); return { success: allow() }; } },
  };
}
const post = (env, { origin = ORIGIN, type = 'text/plain;charset=UTF-8', id = ID, version = 'fd576a9', body = TEXT, method = 'POST' } = {}) => worker.fetch(
  new Request('https://noodlepads.com/api/feedback', {
    method,
    headers: {
      ...(origin ? { Origin: origin } : {}), 'Content-Type': type, ...(id ? { 'X-Feedback': id } : {}),
      ...(version ? { 'X-App-Version': version } : {}), 'CF-Connecting-IP': '192.0.2.9', 'User-Agent': 'Mozilla/5.0 (iPhone)',
    },
    body: method === 'POST' ? body : undefined,
  }),
  { ...env, DB: null, ASSETS: { fetch: async () => new Response('asset') } },
);

test('feedback from the site is stored as typed, under v1/noodlepads/<day>/<version>-<id>.txt, with nothing of the sender', async () => {
  const b = bindings();
  const before = new Date().toISOString().slice(0, 10);
  const res = await post(b);
  const after = new Date().toISOString().slice(0, 10);
  assert.equal(res.status, 204);
  assert.equal(b.put.length, 1);
  assert.match(b.put[0].key, new RegExp(`^v1/noodlepads/\\d{4}-\\d{2}-\\d{2}/fd576a9-${ID}\\.txt$`));
  assert.ok([before, after].includes(b.put[0].key.split('/')[2]), 'the UTC day it came');
  assert.equal(b.put[0].body, TEXT);
  assert.equal(b.put[0].opts.httpMetadata.contentType, 'text/plain; charset=utf-8');
  assert.ok(!JSON.stringify(b.put).includes('192.0.2.9') && !JSON.stringify(b.put).includes('iPhone'), 'no IP, no User-Agent');
  assert.deepEqual(b.asked, [{ key: 'noodlepads' }], 'the rate limit counts the app, never the sender');
  // A retry of the same message (same id) overwrites itself.
  assert.equal((await post(b)).status, 204);
  assert.equal(b.put[1].key, b.put[0].key);
  // A dev copy's version.
  assert.equal((await post(b, { version: 'dev' })).status, 204);
  assert.match(b.put[2].key, /\/dev-/);
});

test('another origin, no origin, a bad id or version, the wrong type or method, an empty or too long body are refused', async () => {
  const b = bindings();
  assert.equal((await post(b, { origin: 'https://example.com' })).status, 403);
  assert.equal((await post(b, { origin: null })).status, 403);
  assert.equal((await post(b, { id: null })).status, 400);
  assert.equal((await post(b, { id: 'not-a-uuid' })).status, 400);
  assert.equal((await post(b, { version: null })).status, 400);
  assert.equal((await post(b, { version: 'a'.repeat(33) })).status, 400);
  assert.equal((await post(b, { body: '' })).status, 400);
  assert.equal((await post(b, { body: 'x'.repeat(4097) })).status, 413);
  assert.equal((await post(b, { type: 'application/json' })).status, 415);
  assert.equal((await post(b, { method: 'GET' })).status, 405);
  assert.equal(b.put.length, 0);
});

test('over the rate limit: 429, nothing stored; a missing bucket says 503 without crashing', async () => {
  const b = bindings({ allow: () => false });
  assert.equal((await post(b)).status, 429);
  assert.equal(b.put.length, 0);
  assert.equal((await post({})).status, 503);
  assert.deepEqual(FEEDBACK_OPTS, { bucket: 'FEEDBACK', app: 'noodlepads', origins: ['https://noodlepads.com'], limiter: 'FEEDBACK_LIMITER' });
});

test('/api/feedback is routed before the cloud: it never reaches handleCloud or the assets', async () => {
  const src = readFileSync(new URL('../worker/index.js', import.meta.url), 'utf8');
  const at = (s) => src.indexOf(s);
  assert.ok(at("'/api/feedback'") > 0 && at("'/api/feedback'") < at("pathname.startsWith('/api/')"));
});

test('site/wrangler.toml binds the shared feedback bucket and its rate limit', () => {
  const toml = readFileSync(new URL('../site/wrangler.toml', import.meta.url), 'utf8');
  assert.match(toml, /\[\[r2_buckets\]\]\s*\nbinding = "FEEDBACK"\s*\nbucket_name = "app-suggestions"/);
  assert.match(toml, /\[\[ratelimits\]\]\s*\nname = "FEEDBACK_LIMITER"\s*\nnamespace_id = "4151"\s*\nsimple = \{ limit = 10, period = 60 \}/);
});

test('the vendored events-worker.js is the one with handleFeedback (just events-vendor in flarepress)', () => {
  const text = readFileSync(new URL('../worker/events-worker.js', import.meta.url), 'utf8');
  assert.match(text, /^export async function handleFeedback\(request, env, opts = \{\}\)/m);
  assert.match(text, /^\/\/ Vendored from pdxfixit\/flarepress events\//);
});
