// A wrong PIN is a usage event (ADR 0027, `noodlepads.cloud` action `pin-wrong`):
// the cloud says no to the PIN, and the app tells the shared telemetry, with no
// log entry and no person. The Worker still notes the wrong try in `activity`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTelemetry, useTelemetry } from '../web/telemetry.js';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const answer = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('a PIN the cloud refuses (wrong, or too many wrong tries) is a pin-wrong event; other trouble is not', async () => {
  const tel = useTelemetry(createTelemetry({
    globals: { window: {}, document: undefined, navigator: {}, storage: globalThis.localStorage, fetch: null, setInterval: () => 1, clearInterval: () => {} },
  }));
  tel.setVersion('v');
  const { unlock } = await import('../web/cloud.js');
  const { state } = await import('../web/state.js');
  state.cloud.set('p-a', { id: 'p-a', key: null, rev: 0, sent: {}, sounds: {}, pin: true, remember: false });
  const pinWrong = () => tel.queued().filter((r) => r.event === 'noodlepads.cloud').map((r) => r.details);

  for (const [status, body] of [[401, { error: 'pin', tries: 4 }], [429, { error: 'wait', wait: 600 }]]) {
    globalThis.fetch = answer(status, body);
    await assert.rejects(unlock('p-a', '9024'));
  }
  assert.deepEqual(pinWrong(), [{ action: 'pin-wrong' }, { action: 'pin-wrong' }]);

  globalThis.fetch = answer(503, { error: 'cloud' });
  await assert.rejects(unlock('p-a', '9024'));
  assert.equal(pinWrong().length, 2, 'a resting cloud is not a wrong PIN');
  // A minute's rate limit, the Worker's or the edge's (a page of its own), is no PIN at all.
  globalThis.fetch = answer(429, { error: 'slow' });
  await assert.rejects(unlock('p-a', '9024'));
  globalThis.fetch = async () => new Response('<html>rate limited</html>', { status: 429, headers: { 'Content-Type': 'text/html' } });
  await assert.rejects(unlock('p-a', '9024'));
  assert.equal(pinWrong().length, 2, 'a 429 slow is not a wrong PIN');
  assert.ok(!JSON.stringify(tel.queued()).includes('p-a'), 'and no record names the person');
});
