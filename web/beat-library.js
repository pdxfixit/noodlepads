// 🗂️ Beats: every saved beat, to open, 📌 pin, duplicate, save as a beat file or
// delete, 📥 Load a beat file, and the thumbnail that draws a beat's rows as dots
// (💃 Grooves uses it too). Made once by sequencer.js with createLibrary; it opens
// beats and reads the open one through `shared` (the beat maker's view of itself).

import { beatFromFile, beatToFile, cleanPattern, isPinned, MAX_BEAT_FILE_BYTES, MAX_PINS } from './beat.js';
import { downloadBlob } from './download.js';
import { newId } from './util.js';
import { openDialog } from './dialogs.js';
import { rowLevel } from './row-volume.js';
import { unsignedSignature } from './settings.js';

export function createLibrary(shared) {
  const { audioSaver, closeEverywhere, deps, el, freshName, library, openBeat, showChips, uniqueName } = shared;
  // ── 🗂️ Beats: every saved beat, to open, 📌 pin, duplicate or delete ──

  let deleteAsked = null;
  function openLibrary(from) {
    el.libNote.textContent = '';
    deleteAsked = null;
    audioSaver.reset();   // a file made for another beat, waiting to be sent, is forgotten
    renderLibrary();
    openDialog(el.library, { returnTo: () => from });
  }

  function renderLibrary() {
    const beats = library();
    el.libSound.disabled = !shared.pattern;   // 🔊 makes the open beat a sound: with none open, nothing to make
    el.libAudio.disabled = !shared.pattern;   // ⬇️ saves it as an audio file: likewise
    el.libEmpty.hidden = beats.length > 0;
    el.libList.replaceChildren(...beats.map((beat) => {
      const item = document.createElement('li');
      item.className = 'lib-beat';
      item.dataset.id = beat.id;
      const open = beat.id === shared.pattern?.id;
      item.classList.toggle('current', open);

      // The whole card opens it.
      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'lib-open';
      openBtn.dataset.load = beat.id;
      const name = document.createElement('span');
      name.className = 'lib-name';
      name.textContent = beat.name;
      const info = document.createElement('span');
      info.className = 'lib-info';
      const bars = beat.bars || 1;
      info.textContent = open ? 'Open now' : `${beat.rows.length} ${beat.rows.length === 1 ? 'sound' : 'sounds'} · ${beat.bpm} BPM${bars > 1 ? ` · ${bars} bars` : ''}`;
      const text = document.createElement('span');
      text.className = 'lib-text';
      text.append(name, info);
      openBtn.append(thumbnail(beat), text);
      openBtn.setAttribute('aria-label', open ? `${beat.name}, open now` : `Open ${beat.name}`);

      // 📌 pins the beat to the pattern chips (up to MAX_PINS), and unpins it.
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'chip-dark lib-pin';
      pin.dataset.pin = beat.id;
      pin.textContent = '📌';
      pin.setAttribute('aria-pressed', String(isPinned(beat)));
      pin.setAttribute('aria-label', isPinned(beat) ? `Unpin ${beat.name} from the chips` : `Pin ${beat.name} to the chips`);
      const dup = document.createElement('button');
      dup.type = 'button';
      dup.className = 'chip-dark';
      dup.dataset.dup = beat.id;
      dup.textContent = '⧉';
      dup.setAttribute('aria-label', `Duplicate ${beat.name}`);
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'chip-dark';
      del.dataset.delete = beat.id;
      const asking = deleteAsked === beat.id;
      del.textContent = asking ? 'Delete?' : '🗑️';
      del.classList.toggle('armed', asking);
      del.setAttribute('aria-label', asking ? `Tap again to delete ${beat.name}` : `Delete ${beat.name}`);
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'chip-dark';
      save.dataset.export = beat.id;
      save.textContent = '📄';
      save.setAttribute('aria-label', `Save ${beat.name} as a beat file`);

      item.append(openBtn, pin, dup, save, del);
      return item;
    }));
  }

  // A beat's rows as lines of 16 dots in each sound's color, so a saved beat
  // can be recognised at a glance.
  function thumbnail(beat) {
    const t = document.createElement('div');
    t.className = 'lib-thumb';
    t.setAttribute('aria-hidden', 'true');
    for (const row of beat.rows.slice(0, 4)) {
      const line = document.createElement('div');
      const clip = deps.clipById(row.clipId);
      if (clip) line.style.setProperty('--pill', deps.colorOf(clip));
      line.style.setProperty('--vol', String(row.muted ? 0 : rowLevel(row)));   // a quieter row draws fainter
      for (const on of row.steps.slice(0, 16)) {
        const dot = document.createElement('span');
        if (on) dot.className = 'on';
        line.append(dot);
      }
      t.append(line);
    }
    return t;
  }

  el.library.addEventListener('click', (e) => {
    const load = e.target.closest('[data-load]');
    if (load) {
      const beat = library().find((b) => b.id === load.dataset.load);
      if (beat && beat.id !== shared.pattern?.id) openBeat(cleanPattern(beat, shared.personId));
      el.library.close();
      return;
    }
    const exp = e.target.closest('[data-export]');
    if (exp) {
      const beat = library().find((b) => b.id === exp.dataset.export);
      if (!beat) return;
      const { file, dropped } = beatToFile(cleanPattern(beat, beat.personId), deps.kitIds());
      const safe = (beat.name || 'beat').replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'beat';
      downloadBlob(new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }), `${safe}.beat.json`);
      el.libNote.textContent = dropped
        ? `Saved “${beat.name}” as a file. ${dropped} recorded ${dropped === 1 ? 'sound stays' : 'sounds stay'} behind: only presets go in a beat file.`
        : `Saved “${beat.name}” as a file.`;
      return;
    }
    const pin = e.target.closest('[data-pin]');
    if (pin) {
      togglePin(pin.dataset.pin);
      return;
    }
    const dup = e.target.closest('[data-dup]');
    if (dup) {
      const beat = library().find((b) => b.id === dup.dataset.dup);
      if (!beat) return;
      const copy = { ...structuredClone(beat), id: newId('beat'), name: uniqueName(beat.name), created: Date.now(), saved: Date.now() };
      delete copy.pinned;   // a copy is a new beat: not pinned
      deps.library.put(copy);
      el.libNote.textContent = `Made a copy: “${copy.name}”.`;
      renderLibrary();
      return;
    }
    const del = e.target.closest('[data-delete]');
    if (del) {
      // Tap once to ask, again to delete, as with deleting a sound.
      if (deleteAsked !== del.dataset.delete) { deleteAsked = del.dataset.delete; renderLibrary(); return; }
      deleteAsked = null;
      const beat = library().find((b) => b.id === del.dataset.delete);
      deps.library.remove(del.dataset.delete);
      el.libNote.textContent = beat ? `Deleted “${beat.name}”.` : '';
      // Deleting the open beat opens the scratch.
      if (beat) closeEverywhere(beat.id);
      renderLibrary();
      (el.libList.querySelector('[data-load]') || el.libSound).focus();
    }
  });

  // 📌 in 🗂️ Beats: pins a beat to the chips' first spots, in the order pinned,
  // or unpins it. Pinning is not using it: its `saved` stamp stays. With
  // MAX_PINS pinned, another waits until one is unpinned.
  function togglePin(id) {
    const beat = library().find((b) => b.id === id);
    if (!beat) return;
    const record = structuredClone(beat);
    if (isPinned(beat)) {
      delete record.pinned;
      el.libNote.textContent = `Unpinned “${beat.name}”.`;
    } else if (library().filter(isPinned).length >= MAX_PINS) {
      el.libNote.textContent = `${MAX_PINS} beats are pinned already: unpin one first.`;
      return;
    } else {
      record.pinned = Date.now();
      el.libNote.textContent = `Pinned “${beat.name}” to the chips.`;
    }
    deps.library.put(record);
    renderLibrary();
    showChips();
    el.libList.querySelector(`[data-pin="${CSS.escape(id)}"]`)?.focus();
  }

  // 📥 Load a beat file: it joins the list under a name no other beat has,
  // and opens on this screen.
  el.libFile?.addEventListener('change', async () => {
    const f = el.libFile.files?.[0];
    el.libFile.value = '';
    if (!f) return;
    try {
      if (f.size > MAX_BEAT_FILE_BYTES) throw new Error('That file is too big to be a beat.');
      const beat = beatFromFile(await f.text(), shared.personId, deps.kitIds(), unsignedSignature(shared.personId));
      const now = Date.now();
      Object.assign(beat, { id: newId('beat'), name: uniqueName(beat.name || freshName()), created: now, saved: now });
      openBeat(beat);
      el.library.close();
      deps.announce?.(`Loaded “${beat.name}”.`);
    } catch (err) {
      el.libNote.textContent = err.message;
    }
  });

  return { openLibrary, thumbnail };
}
