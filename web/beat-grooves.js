// 💃 Grooves: the starter grooves by style, a groove's short sample (one pass,
// at most SAMPLE_SECONDS, which 🎧 From a song's parts use too through hearBeat), loading a
// groove into the scratch or adding its hits to the open beat, and its Undo
// (undoLoad). Made once by sequencer.js with createGrooves; it works on the open
// beat through `shared` (the beat maker's view of itself), and `thumbnail` is
// 🗂️ Beats' picture of a beat's rows.

import { GROOVE_GROUPS, GROOVES } from './grooves.js';
import { cleanPattern, grooveBeat, groovePlayers, grooveShape, mergeGroove, SAMPLE_SECONDS } from './beat.js';
import { hasHits, isScratch, scratchId } from './scratch.js';
import { logEvent } from './log.js';
import { openDialog } from './dialogs.js';

export function createGrooves(shared, { thumbnail }) {
  const { audio, bar, beatPlan, deps, el, engine, letGo, library, offerUndo, onScratch, openBeat, play, playing, prepare, prepareBeats, render, save, scratchSaved, snapshot, stop } = shared;
  // ── Starter grooves ──

  // The dialog lists the grooves by style (GROOVE_GROUPS), each group a
  // heading that opens and shuts like the groups in the emoji list. The
  // groups open now are remembered until the page reloads; at first they
  // are all shut, a short menu of styles.
  const grooveFolds = new Set();
  const hasClip = (id) => !!deps.clipById(id);
  // What a groove's card says under its name: its drums, then "bass" and
  // "chords" if it has them, its length if over a bar, its time signature
  // if not 4/4, and its tempo.
  function grooveInfo(g, beat) {
    const groups = beat.rows.map((r) => deps.clipById(r.clipId)?.group);
    const drums = beat.rows.filter((_, i) => !['bass', 'chords'].includes(groups[i])).map((r) => deps.clipById(r.clipId)?.label).filter(Boolean);
    const parts = [drums.join(', ')];
    if (groups.includes('bass')) parts.push('bass');
    if (groups.includes('chords')) parts.push('chords');
    const { signature, bars } = grooveShape(g);
    return [parts.filter(Boolean).join(' + '), bars > 1 ? `${bars} bars` : '', signature === '4/4' ? '' : signature, `${g.bpm} BPM`]
      .filter(Boolean).join(' · ');
  }
  function grooveCard(g) {
    const beat = grooveBeat(g, shared.personId, hasClip);
    const li = document.createElement('li');
    li.className = 'groove-item';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lib-beat groove';
    b.dataset.groove = g.id;
    const text = document.createElement('span');
    text.className = 'lib-text';
    const name = document.createElement('span');
    name.className = 'lib-name';
    name.textContent = `${g.emoji} ${g.name}`;
    // Under the name, where it comes from and what to listen for; the
    // sounds, bars and tempo only with Advanced (Ben, 2026-10-17).
    const about = document.createElement('span');
    about.className = 'lib-info groove-about';
    about.textContent = g.about;
    text.append(name, about);
    // Who plays it, beyond the drums: a chip per instrument in its family's
    // color, as in the picker (ADR 0030).
    const players = groovePlayers(g, (kit) => deps.clipById(`${shared.personId}-${kit}`) ?? null);
    if (players.length) {
      const who = document.createElement('span');
      who.className = 'groove-who';
      for (const i of players) {
        const chip = document.createElement('span');
        chip.className = 'groove-player';
        chip.dataset.inst = i.id;
        chip.dataset.family = i.family.id;
        chip.style.setProperty('--fam', i.family.color);
        chip.textContent = `${i.emoji} ${i.name}`;
        who.append(chip);
      }
      text.append(who);
    }
    if (shared.advanced) {
      const info = document.createElement('span');
      info.className = 'lib-info groove-parts';
      info.textContent = grooveInfo(g, beat);
      text.append(info);
    }
    b.append(thumbnail(beat), text);
    // ▶ beside the card plays a short sample without opening it (Ben, 2026-10-12).
    const hear = document.createElement('button');
    hear.type = 'button';
    hear.className = 'chip-dark groove-hear';
    hear.dataset.hear = g.id;
    showHearKey(hear);
    li.append(b, hear);
    return li;
  }
  // ── A groove's sample in the chooser: one pass, at most SAMPLE_SECONDS ──
  // Played as Song mode plays a beat (beatPlan, soundHit), so there is no
  // second player. One thing plays at a time: the beat stops (a groove tried
  // in the keys view stays on screen) and a song stops. ■, another ▶, picking
  // a groove or closing the dialog ends it.
  // 🎧 From a song's ▶ on each part plays a beat of its own the same way
  // (hearBeat): one thing at a time, and its `onEnd` hears when it stops.
  let sample = null;   // {id, run (the engine's, on a planned list), timer, onEnd, pattern (the beat heard)}
  function showHearKey(b) {
    const g = GROOVES.find((x) => x.id === b.dataset.hear);
    const on = sample?.id === b.dataset.hear;
    b.textContent = on ? '■' : '▶';
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? `Stop the ${g?.name ?? ''} sample` : `Hear a bit of ${g?.name ?? 'this groove'}`);
  }
  const showHearKeys = () => { for (const b of el.grooveList.querySelectorAll('[data-hear]')) showHearKey(b); };
  function stopSample() {
    if (!sample) return;
    clearTimeout(sample.timer);
    sample.run?.stop();   // its voices fade
    const { onEnd, pattern: heard } = sample;
    if (heard) letGo((m) => m.p === heard);
    sample = null;
    showHearKeys();
    onEnd?.();
  }
  // Plays one pass of a beat (`raw`, as stored), at most `seconds` of it,
  // as `id`; the same id again stops it.
  async function hearBeat(id, raw, { seconds: most = SAMPLE_SECONDS, onEnd } = {}) {
    const again = sample?.id === id;
    stopSample();
    if (again) return;   // ■: the same ▶ again stops it
    stop();              // the beat, or a ▶ still loading its sounds
    deps.onPlay?.();     // a song playing stops
    const mine = { id, run: null, timer: 0, onEnd };
    sample = mine;
    showHearKeys();
    const plan = beatPlan(raw);
    mine.pattern = plan.pattern;
    await prepareBeats([plan.pattern]);
    if (sample !== mine) return;   // stopped while its sounds loaded
    const ctx = audio.wake();
    const t0 = ctx.currentTime + 0.05;
    const seconds = Math.min(plan.seconds, most);
    // The whole pass is booked on the first tick, as one list.
    const events = plan.hits.filter((h) => h.time < seconds)
      .map((h) => ({ at: t0 + h.time, pattern: plan.pattern, row: h.row, loud: h.loud, note: h.note, len: h.len, dest: audio.master, key: h.row }));
    mine.run = engine.play({ list: { events }, lookahead: seconds + 1, onStop: () => { if (sample === mine) stopSample(); } });
    mine.run.tick();
    logEvent('beat', { action: 'sample', bpm: plan.pattern.bpm, bars: plan.pattern.bars, seconds: Math.round(seconds * 10) / 10 });
    mine.timer = setTimeout(() => { if (sample === mine) stopSample(); }, (seconds + 0.4) * 1000);
  }
  const playSample = (g) => hearBeat(g.id, grooveBeat(g, shared.personId, hasClip));
  function showFold(sec, open) {
    sec.head.setAttribute('aria-expanded', String(open));
    sec.head.querySelector('.emoji-all-caret').textContent = open ? '▾' : '▸';
    sec.box.classList.toggle('open', open);
    sec.list.hidden = !open;
  }
  function renderGrooves() {
    el.grooveList.replaceChildren(...GROOVE_GROUPS.map((group) => {
      const grooves = GROOVES.filter((g) => g.group === group.id);
      const box = document.createElement('section');
      box.className = 'emoji-all-sec groove-sec';
      const h = document.createElement('h3');
      h.className = 'emoji-all-h';
      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'emoji-all-group';
      head.dataset.grooveGroup = group.id;
      const list = document.createElement('ul');
      list.className = 'lib-list';
      list.id = `groove-group-${group.id}`;
      head.setAttribute('aria-controls', list.id);
      const caret = document.createElement('span');
      caret.className = 'emoji-all-caret';
      caret.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'emoji-all-name';
      label.textContent = `${group.emoji} ${group.name}`;
      const count = document.createElement('span');
      count.className = 'emoji-all-count';
      count.textContent = String(grooves.length);
      count.setAttribute('aria-label', `${grooves.length} grooves`);
      head.append(caret, label, count);
      h.append(head);
      list.append(...grooves.map(grooveCard));
      box.append(h, list);
      showFold({ box, head, list }, grooveFolds.has(group.id));
      return box;
    }));
  }
  // `from`: the button that opened it, which gets the focus back.
  function openGrooves(from) {
    el.grooveNote.textContent = '';
    showGrooveHow();
    renderGrooves();
    deps.onGroovesOpen?.();   // 🎧 From a song's card shows for this person's level
    openDialog(el.grooves, from ? { returnTo: () => from } : undefined);
  }

  // A groove loads into the scratch (ADR 0020), so nothing in 🗂️ Beats is
  // copied or overwritten, and the scratch opens; or, with ➕, its hits join
  // the open beat. Undo puts back the beat that was open and the scratch as
  // it was.
  let grooveAdds = false;   // the dialog's choice: into the scratch (off) or add to this one
  // In the keys a groove always loads into the scratch.
  const adding = () => grooveAdds && !!shared.pattern && shared.slot !== 'dj';
  function showGrooveHow() {
    // In the keys a groove plays behind you: there is nothing to choose.
    el.grooveHow.hidden = shared.slot === 'dj';
    for (const b of el.grooveHow.querySelectorAll('[data-how]')) {
      b.setAttribute('aria-pressed', String((b.dataset.how === 'add') === adding()));
      if (b.dataset.how === 'add') b.disabled = !shared.pattern;
    }
    const kept = onScratch() ? '' : ' Yours stays in 🗂️ Beats.';
    el.grooveHint.textContent = shared.slot === 'dj'
      ? `Tap one to load it into your scratch beat and play along: ▶ Play plays it behind you, ● Record adds your hits, and 💾 Keep saves it.${kept}`
      : adding()
      ? 'Adds the groove’s hits to the beat on screen. Nothing is turned off, and Undo takes them back out.'
      : `Loads the groove into your scratch beat to play with. 💾 Keep saves it in 🗂️ Beats.${kept}`;
  }
  el.grooveHow.addEventListener('click', (e) => {
    const b = e.target.closest('[data-how]');
    if (!b) return;
    grooveAdds = b.dataset.how === 'add';
    showGrooveHow();
  });
  function pickGroove(button) {
    const g = GROOVES.find((x) => x.id === button.dataset.groove);
    if (!g) return;
    if (adding()) {
      const before = snapshot();
      const { rows, added } = mergeGroove(shared.pattern.rows, grooveBeat(g, shared.personId, hasClip).rows, bar(), shared.pattern.bars, grooveShape(g));
      el.grooves.close();
      const had = shared.pattern.rows.length;
      shared.pattern.rows = rows;
      if (playing()) for (const r of rows.slice(had)) prepare(deps.clipById(r.clipId));   // new rows join from their next pill
      save();
      render();
      deps.onBeatChange?.();
      offerUndo({ before, pattern: shared.pattern, groove: g.name, added });
      shared.undoBanner?.focus();
      return;
    }
    el.grooves.close();
    loadGroove(g);
    if (shared.slot !== 'dj') shared.undoBanner?.focus();
  }

  // The groove into the scratch, which opens. With ⌨️ Keys on it opens
  // stopped ("opening a groove in the beat builder should open stopped"),
  // and ▶ Play plays it behind the keys; on Beats a beat playing carries on.
  // A scratch with hits is replaced, so the line says so, with Undo (Keys
  // off) or ↩️ Beat (Keys on).
  function loadGroove(g) {
    const old = scratchSaved();
    const was = {
      before: structuredClone(shared.pattern),
      scratchBefore: old ? structuredClone(old) : null,
      groove: g.name,
      replaced: hasHits(old),
    };
    const resume = shared.slot !== 'dj' && playing();
    shared.queued = null;
    stop();
    shared.pattern = { ...grooveBeat(g, shared.personId, hasClip), id: old?.id ?? scratchId(shared.personId), name: g.name };
    save();
    shared.loaded = was;
    render();
    deps.onBeatChange?.();
    if (resume) play();
    logEvent('beat', { action: 'groove', replaced: was.replaced });
    if (shared.slot !== 'dj') offerUndo({ ...was, pattern: shared.pattern });
  }
  // Undo of a groove loaded: the scratch as it was, and the beat that was
  // open before (the scratch, or a beat in 🗂️ Beats).
  function undoLoad(was) {
    shared.loaded = null;
    if (was.scratchBefore) deps.library.put(was.scratchBefore);
    else if (scratchSaved()) deps.library.remove(scratchSaved().id);
    const back = was.before && !isScratch(was.before) && library().find((b) => b.id === was.before.id);
    openBeat(back ? cleanPattern(back, shared.personId) : null, { resume: shared.slot !== 'dj' });
  }

  el.grooveList.addEventListener('click', (e) => {
    const head = e.target.closest('[data-groove-group]');
    if (head) {
      const id = head.dataset.grooveGroup;
      const open = !grooveFolds.has(id);
      if (open) grooveFolds.add(id); else grooveFolds.delete(id);
      showFold({ box: head.closest('section'), head, list: el.grooveList.querySelector(`#groove-group-${id}`) }, open);
      return;
    }
    const hear = e.target.closest('[data-hear]');
    if (hear) { const g = GROOVES.find((x) => x.id === hear.dataset.hear); if (g) playSample(g); return; }
    const b = e.target.closest('[data-groove]');
    if (b) { stopSample(); pickGroove(b); }
  });

  // ── The keys: a groove just loaded (Ben, 2026-10-12; ADR 0020) ──
  // The keys view shows a line while the scratch holds a groove just loaded
  // and nothing has changed it yet: `trying()`. ↩️ Beat there is the
  // groove's Undo (putTrialAway). Recording onto it or changing it ends the
  // line; the groove stays in the scratch.
  const trying = () => (shared.loaded && onScratch() ? { groove: shared.loaded.groove, replaced: shared.loaded.replaced } : null);
  function putTrialAway() {
    if (!shared.loaded) return;
    stop();
    undoLoad(shared.loaded);
  }
  // 💃 Grooves sits in the beat bar on both screens (Ben, 2026-10-12).
  for (const bar of el.beatBars ?? []) {
    const b = bar.querySelector('[data-beat-grooves]');
    b?.addEventListener('click', () => openGrooves(b));
  }

  return { sample: () => sample, stopSample, undoLoad, hearBeat, trying, putTrialAway };
}
