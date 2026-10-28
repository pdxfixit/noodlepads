// 🧸 Kids' spoken prompts (Ben, 2026-10-28): "Tap a picture!" for a kid who can't
// read yet, played only when its recording is in web/clips/kids-prompts/,
// once per person per screen, never over sound. The player on stand-ins, the
// list against sw.js and tools/kids_prompts.py, then the real app on the
// stand-in page. How it sounds needs a real recording and a phone.

import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createSay } from '../web/kids-say.js';
import { KIDS_PROMPTS, RECORDED, MAX_PROMPT_SECONDS, promptFor, promptClip, promptFile, seenId } from '../web/kids-prompts.js';
import { KIDS_TABS } from '../web/kids-logic.js';
import { cleanSeen, seenSet } from '../web/firsts.js';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { getSetting, setSetting } from '../web/settings.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pads = KIDS_PROMPTS[0];

// A host on stand-ins: `log` says what happened.
function host(over = {}) {
  const log = [];
  const heard = new Set();
  const h = {
    log, heard,
    recorded: () => ['pads', 'record', 'beats', 'keys'],
    wanted: (p) => !heard.has(p.id),
    mark: (p) => { heard.add(p.id); log.push(`mark ${p.id}`); },
    busy: () => false,
    ready: () => true,
    load: async (p) => { log.push(`load ${p.id}`); return p.id; },
    start: (p) => { log.push(`start ${p.id}`); return { stop: () => log.push(`stop ${p.id}`) }; },
    ...over,
  };
  return h;
}

test('a recorded prompt plays a moment after its screen shows, and is kept as heard', async () => {
  const h = host();
  const say = createSay(h, 5);
  say.maybe(pads);
  assert.deepEqual(h.log, [], 'not at once');
  await wait(30);
  assert.deepEqual(h.log, ['load pads', 'start pads', 'mark pads']);
});

test('with no recording nothing loads, plays or is kept', async () => {
  const h = host({ recorded: () => [] });
  const say = createSay(h, 5);
  say.maybe(pads);
  say.maybe(undefined);
  await wait(30);
  assert.deepEqual(h.log, []);
});

test('once only: a prompt already heard is not said again', async () => {
  const h = host();
  const say = createSay(h, 5);
  say.maybe(pads);
  await wait(30);
  h.log.length = 0;
  say.maybe(pads);
  await wait(30);
  assert.deepEqual(h.log.filter((l) => !l.startsWith('stop')), [], 'nothing loads, starts or is kept again');
});

test('never over sound: busy or not-yet-woken audio skips it, unmarked, to try next time', async () => {
  for (const over of [{ busy: () => true }, { ready: () => false }]) {
    const h = host(over);
    createSay(h, 5).maybe(pads);
    await wait(30);
    assert.deepEqual(h.log, [], 'skipped');
    assert.equal(h.heard.size, 0, 'not kept as heard');
  }
});

test('a kid who gets busy while it loads is not spoken over', async () => {
  let busy = false;
  const h = host({ busy: () => busy, load: async (p) => { busy = true; return p.id; } });
  createSay(h, 5).maybe(pads);
  await wait(30);
  assert.deepEqual(h.log, []);
});

test('hush cancels a prompt still waiting, and stops one speaking', async () => {
  const h = host();
  const say = createSay(h, 20);
  say.maybe(pads);
  say.hush();
  await wait(40);
  assert.deepEqual(h.log, [], 'cancelled before it started');
  say.maybe(pads);
  await wait(40);
  assert.deepEqual(h.log, ['load pads', 'start pads', 'mark pads']);
  say.hush();
  assert.equal(h.log.at(-1), 'stop pads');
});

test('a new screen ends the last prompt; a load that fails says nothing', async () => {
  const h = host();
  const say = createSay(h, 5);
  say.maybe(pads);
  await wait(30);
  say.maybe(KIDS_PROMPTS[1]);
  assert.equal(h.log.at(-1), 'stop pads');
  await wait(30);
  const failing = host({ load: async () => { throw new Error('no file'); } });
  createSay(failing, 5).maybe(pads);
  await wait(30);
  assert.deepEqual(failing.log, []);
  assert.equal(failing.heard.size, 0);
});

test('the prompt list: one per Kids screen, short kid words, ids a person can keep', () => {
  assert.deepEqual(KIDS_PROMPTS.map((p) => p.tab).sort(), [...KIDS_TABS].sort());
  for (const p of KIDS_PROMPTS) {
    assert.ok(p.words.length <= 30 && /[!?.]$/.test(p.words), `${p.id}: short, one sentence`);
    assert.ok(p.level <= 0 && p.level >= -24, `${p.id}: a level is a turn-down`);
    assert.equal(cleanSeen(seenId(p)), seenId(p), `${p.id}: a valid id for the person's seen setting`);
    assert.equal(promptFor(p.tab), p);
    assert.equal(promptClip(p).file, promptFile(p.id));
  }
  assert.ok(MAX_PROMPT_SECONDS <= 2.5);
  assert.ok(RECORDED.every((id) => KIDS_PROMPTS.some((p) => p.id === id)), 'RECORDED names real prompts');
});

test('web/sw.js keeps exactly the recorded prompts for offline', () => {
  const src = readFileSync(new URL('../web/sw.js', import.meta.url), 'utf8');
  const list = /^const KIDS_PROMPTS = (\[.*\]);/m.exec(src);
  assert.ok(list, 'sw.js has the KIDS_PROMPTS line tools/kids_prompts.py writes');
  assert.deepEqual([...vm.runInNewContext(list[1])], RECORDED);
});

test('until a prompt is recorded, TODO.md tells a family member its file and exact words', () => {
  const todo = readFileSync(new URL('../TODO.md', import.meta.url), 'utf8');
  for (const p of KIDS_PROMPTS.filter((q) => !RECORDED.includes(q.id))) {
    assert.ok(todo.includes(`\`${p.id}.wav\` | ${p.words}`), `TODO.md "Ben does" lists ${p.id}.wav and "${p.words}"`);
  }
});

test('tools/kids_prompts.py reads the same prompts as the app', () => {
  const run = spawnSync('python3', ['-I', new URL('../tools/kids_prompts.py', import.meta.url).pathname, '--list'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), KIDS_PROMPTS.map((p) => ({ ...p })));
});

// ── The real app ──

let page;
let $;
let ctx;
before(async () => {
  console.error = () => {};
  globalThis.indexedDB = fakeIndexedDB();
  page = installPage({ firstSteps: true });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  $('#wl-skip').dispatch('click');
  await setSetting('level', 'kids');
  await page.settle();
  ctx = (await import('../web/audio.js')).audio;
});

const tab = async (name) => { $(`[data-kids-tab="${name}"]`).dispatch('click'); await page.settle(); await wait(450); await page.settle(); };

// audio.js on stand-ins: a prompt's load and start are recorded, the rest is left alone.
function spy() {
  const real = { load: ctx.load, start: ctx.start, stop: ctx.stop, play: ctx.play };
  const log = [];
  ctx.load = async (clip) => { if (clip.id.startsWith('kids-say-')) { log.push(`load ${clip.id} ${clip.file}`); return { buffer: {}, duration: 1 }; } return real.load.call(ctx, clip); };
  ctx.start = (id, ...rest) => { if (id.startsWith('kids-say-')) { log.push(`start ${id}`); return; } return real.start.call(ctx, id, ...rest); };
  ctx.stop = (id, ...rest) => { if (id.startsWith('kids-say-')) { log.push(`stop ${id}`); return; } return real.stop.call(ctx, id, ...rest); };
  ctx.play = async () => {};
  navigator.userActivation = { isActive: true };
  return { log, restore: () => { Object.assign(ctx, real); delete navigator.userActivation; } };
}

const REAL = [...RECORDED];   // what the repo has recorded; a test sets its own
afterEach(() => { RECORDED.splice(0, RECORDED.length, ...REAL); });

test('app: with no recordings Kids says nothing and keeps nothing', async () => {
  const s = spy();
  await setSetting('seen', '');
  RECORDED.length = 0;
  await tab('beats');
  await tab('keys');
  s.restore();
  assert.deepEqual(s.log, []);
  assert.ok(![...seenSet(getSetting('seen'))].some((id) => id.startsWith('kids-say-')));
});

test('app: a recorded prompt plays once when its screen shows, then never again for that kid', async () => {
  const s = spy();
  await setSetting('seen', '');
  RECORDED.splice(0, RECORDED.length, 'beats');
  await tab('pads');
  await tab('beats');
  assert.deepEqual(s.log, ['load kids-say-beats clips/kids-prompts/beats.wav', 'start kids-say-beats']);
  assert.ok(seenSet(getSetting('seen')).has('kids-say-beats'), "kept as this person's");
  await tab('keys');
  await tab('beats');
  s.restore();
  assert.equal(s.log.filter((l) => l.startsWith('start')).length, 1, 'once per kid per place');
});

test('app: Record says nothing while the mic is missing or refused, and speaks once there is one', async () => {
  const s = spy();
  await setSetting('seen', '');
  RECORDED.splice(0, RECORDED.length, 'record');
  await tab('record');
  assert.equal($('#kids-mic').disabled, true, 'the stand-in page has no microphone');
  assert.deepEqual(s.log, [], 'a blocked mic: nothing to tap, nothing said');
  assert.ok(!seenSet(getSetting('seen')).has('kids-say-record'));
  window.MediaRecorder = class {};
  navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [] }) };
  await tab('pads');
  await tab('record');
  assert.equal($('#kids-mic').disabled, false);
  assert.deepEqual(s.log, ['load kids-say-record clips/kids-prompts/record.wav', 'start kids-say-record']);
  s.restore();
  delete window.MediaRecorder;
  delete navigator.mediaDevices;
});

test('the player asks again when the prompt is due: a mic refused while it waited stays unspoken', async () => {
  let ok = true;
  const h = host({ wanted: () => ok });
  createSay(h, 20).maybe(pads);
  ok = false;
  await wait(50);
  assert.deepEqual(h.log, []);
});

test('app: a touch ends a prompt that is waiting, and a Regular person is never spoken to', async () => {
  const s = spy();
  await setSetting('seen', '');
  RECORDED.splice(0, RECORDED.length, 'keys');
  $('[data-kids-tab="keys"]').dispatch('click');
  $('#kids').dispatch('pointerdown');   // the kid is already doing something
  await wait(450);
  await page.settle();
  assert.deepEqual(s.log.filter((l) => !l.startsWith('stop')), [], 'cancelled by the touch');
  assert.ok(!seenSet(getSetting('seen')).has('kids-say-keys'), 'so it tries again next time');
  await setSetting('level', 'regular');
  await tab('pads');
  await tab('keys');
  assert.deepEqual(s.log.filter((l) => !l.startsWith('stop')), [], 'not for a grown-up on a Kids visit');
  await setSetting('level', 'kids');
  s.restore();
});
