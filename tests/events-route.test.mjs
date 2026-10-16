// Usage events reach the cloud through POST /api/events (worker/index.js,
// flarepress's shared events-worker.js): from the site's own origin only,
// stored in R2 as sent. The shared files are vendored copies, never edited
// here, and site/wrangler.toml binds the bucket.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import worker, { EVENTS_OPTS } from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';

const BATCH = '0b6f2c1e-3d4a-4b5c-8d9e-0f1a2b3c4d5e';
const line = JSON.stringify({ app: 'noodlepads', platform: 'web', event: 'screen.view', details: { from: 'pads' } });

function bucket() {
  const put = [];
  return { put, EVENTS: { put: async (key, body) => { put.push([key, new TextDecoder().decode(body)]); } } };
}
const post = (env, { origin = ORIGIN, type = 'text/plain;charset=UTF-8', batch = BATCH, body = `${line}\n`, method = 'POST' } = {}) => worker.fetch(
  new Request('https://noodlepads.com/api/events', {
    method,
    headers: { ...(origin ? { Origin: origin } : {}), 'Content-Type': type, ...(batch ? { 'X-Batch': batch } : {}), 'CF-Connecting-IP': '192.0.2.9' },
    body: method === 'POST' ? body : undefined,
  }),
  { ...env, DB: null, ASSETS: { fetch: async () => new Response('asset') } },
);

test('a batch from the site is stored in R2 as sent, under v1/<day>/<batch>.jsonl, with nothing of the IP', async () => {
  const b = bucket();
  assert.equal((await post(b)).status, 204);
  assert.equal(b.put.length, 1);
  assert.match(b.put[0][0], new RegExp(`^v1/\\d{4}-\\d{2}-\\d{2}/${BATCH}\\.jsonl$`));
  assert.equal(b.put[0][1], `${line}\n`);
  assert.ok(!b.put[0][1].includes('192.0.2.9'));
});

test('another origin, no batch id, the wrong type or method, and a missing bucket are refused', async () => {
  const b = bucket();
  assert.equal((await post(b, { origin: 'https://example.com' })).status, 403);
  assert.equal((await post(b, { origin: null })).status, 403);
  assert.equal((await post(b, { batch: null })).status, 400);
  assert.equal((await post(b, { type: 'application/json' })).status, 415);
  assert.equal((await post(b, { method: 'GET' })).status, 405);
  assert.equal(b.put.length, 0);
  assert.equal((await post({})).status, 503, 'no EVENTS binding: said plainly, nothing crashes');
  assert.deepEqual(EVENTS_OPTS, { bucket: 'EVENTS', origins: ['https://noodlepads.com'] });
});

test('site/wrangler.toml binds the bucket the runner reads as EVENTS', () => {
  const toml = readFileSync(new URL('../site/wrangler.toml', import.meta.url), 'utf8');
  assert.match(toml, /\[\[r2_buckets\]\]\s*\nbinding = "EVENTS"\s*\nbucket_name = "noodlepads-telemetry"/);
});

test('the shared files are flarepress\'s, unedited (just events-vendor in flarepress updates them)', () => {
  for (const path of ['../web/events-client.js', '../worker/events-worker.js']) {
    const text = readFileSync(new URL(path, import.meta.url), 'utf8');
    const [head1, , head3, ...rest] = text.split('\n');
    assert.match(head1, /^\/\/ Vendored from pdxfixit\/flarepress events\//, path);
    const sha = head3.match(/^\/\/ sha256 of the original: ([0-9a-f]{64})$/)?.[1];
    assert.equal(createHash('sha256').update(rest.join('\n')).digest('hex'), sha, `${path} was edited here`);
  }
});
