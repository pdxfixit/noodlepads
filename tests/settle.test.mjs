// settle() (tests/fake-dom.mjs) must not return while a page is still reading
// the body of an answer it got: a slow or descheduled machine took event-loop
// turns there that no timer or fetch showed, and the cloud tests asserted on a
// page that had not gone on yet (2026-10-27, cloud-needs-pin).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';

test('settle waits for the body of a fetched answer to be read', async () => {
  const page = installPage();
  const realSetTimeout = globalThis.setTimeout;
  globalThis.fetch = async () => {
    const res = new Response('{"ok":true}');
    const json = res.json.bind(res);
    // A body that needs a while to arrive, as one does on a loaded machine.
    res.json = async () => { await new Promise((r) => realSetTimeout(r, 80)); return json(); };
    return res;
  };
  let got = null;
  fetch('/api/x').then((res) => res.json()).then((v) => { got = v; });
  await page.settle();
  assert.deepEqual(got, { ok: true });
});
