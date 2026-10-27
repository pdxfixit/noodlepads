// `just cloud-smoke` (tools/look-cloud.mjs) run here against the real Worker
// on a fake D1, as the deploy runs it against noodlepads.com: every step
// passes, a deleted sound's old audio answers 404, and the throwaway profile
// is gone at the end.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { FakeD1 } from './fake-d1.mjs';
import { main } from '../tools/look-cloud.mjs';

test('cloud-smoke passes against the Worker, checks a deleted sound frees its audio, and still sees a deleted profile take its sound', async () => {
  const stored = [];
  const bucket = { put: async (key) => { stored.push(key); } };
  const env = {
    DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') }, ALLOW_UNPROVEN_CHECKS: 'tests',
    EVENTS: bucket, FEEDBACK: bucket, FEEDBACK_LIMITER: { limit: async () => ({ success: true }) },
  };
  const realFetch = globalThis.fetch;
  const log = console.log;
  const said = [];
  globalThis.fetch = (url, init = {}) => worker.fetch(new Request(String(url), { ...init, duplex: 'half' }), env);
  console.log = (...args) => said.push(args.join(' '));
  let code;
  try {
    code = await main('cloud-smoke', ['--url', 'https://noodlepads.com']);
  } finally {
    globalThis.fetch = realFetch;
    console.log = log;
  }
  assert.equal(code, 0, said.join('\n'));
  assert.ok(said.some((l) => l.startsWith("✅ deleted the sound's record: its audio answers 404 at once")), said.join('\n'));
  assert.ok(said.some((l) => l.startsWith('✅ uploaded a small sound to keep')), 'a sound is kept for the profile delete to take');
  assert.ok(said.some((l) => l.startsWith('✅ gone: not listed, opens 404, its sound and its share code 404')), said.join('\n'));
  for (const start of ['✅ a create without a PIN is refused', '✅ a PATCH that clears the PIN is refused', '✅ five wrong PINs at open: it waits', '✅ deleted it with the key and the right PIN']) {
    assert.ok(said.some((l) => l.startsWith(start)), `${start}: ${said.join('\n')}`);
  }
  assert.ok(said.some((l) => l.startsWith('✅ /api/log, /api/events, /api/feedback are routed, bound and refuse an empty post (400)')), said.join('\n'));
  assert.deepEqual(stored, [], 'the route check stores no event or feedback');
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM reports')[0].n, 0, 'nor a report');
  assert.ok(!said.some((l) => l.startsWith('❌')), said.join('\n'));
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM sounds')[0].n, 0, 'nothing left in the cloud');
  assert.equal(env.DB.rows("SELECT COUNT(*) AS n FROM profiles WHERE id LIKE 'p-smoke-%'")[0].n, 0);
});
