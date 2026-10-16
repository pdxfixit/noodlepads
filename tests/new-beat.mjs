// A new beat has no rows (Ben, 2026-10-11), and 🆕 New opens a blank scratch
// (Ben, 2026-10-12). Tests that want a beat with a row start one, add the
// row the way a kid would, and 💾 Keep it, so it is a named beat in 🗂️ My
// beats. `page` is installPage's.

// Beats: 🆕 New, + Add a row (it starts on this board's first sound), 💾 Keep.
export function newBeatWithRow(page) {
  const $ = page.$;
  const bar = document.querySelectorAll('.beat-bar')[0];
  bar.querySelector('[data-beat-new]').dispatch('click');
  $('#seq-add').dispatch('click'); $('#chooser-ok').dispatch('click');
  bar.querySelector('[data-beat-keep]').dispatch('click');
}

// Beats with ⌨️ Keys on (ADR 0017; once DJ's Beat Builder), and off again.
// The toggle is remembered on the device, so a test that turns it on turns
// it off before it ends.
export function keysOn(page) {
  page.$('#beats-toggle').dispatch('click');
  if (!document.body.classList.contains('keys-on')) page.$('#seq-keys').dispatch('click');
}
export function keysOff(page) {
  page.$('#beats-toggle').dispatch('click');
  if (document.body.classList.contains('keys-on')) page.$('#dj-keys-toggle').dispatch('click');
}

// Beats with ⌨️ Keys: 🆕 New, then ● Record, one key after the count-in (a row for
// its sound, its first pill on), ● Stop, the done bar closed, and 💾 Keep. Z is Bass C,
// so a test about the Kick (A) or Snare (S) row is not disturbed. The audio
// clock is put back afterwards.
export async function newBuilderBeatWithRow(page, { key = 'z', code = 'KeyZ' } = {}) {
  const $ = page.$;
  const { audio } = await import('../web/audio.js');   // after the page is up
  const ctx = audio.context();
  const was = ctx.currentTime;
  if (!document.body.classList.contains('keys-on')) keysOn(page);
  $('#dj-beatbar').querySelector('[data-beat-new]').dispatch('click');
  ctx.currentTime = 50;
  $('#dj-record').dispatch('click');
  await page.settle();
  // One bar of count-in at 100 BPM (2.4 s) after a 0.05 s start: the "1" is at 52.45.
  ctx.currentTime = 52.47;
  page.key(key, { code });
  $('#dj-record').dispatch('click');
  $('#banner-close').dispatch('click');
  $('#dj-beatbar').querySelector('[data-beat-keep]').dispatch('click');
  ctx.currentTime = was;
}
