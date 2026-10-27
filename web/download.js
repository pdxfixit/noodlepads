// Hands a Blob to the user as a file download (a backup, a beat file)
// through a temporary link. Needs a page; nothing here runs until it is called.

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  // Give the download time to start before the link is let go. unref keeps a
  // test run (where this is Node's timer) from waiting for it.
  const timer = setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  timer?.unref?.();
}

// ── ⬇️ Save as audio file: the share sheet on a phone, a download elsewhere ──

// 'share' on a touch device whose browser can share this file, else 'download'.
// A computer (a fine pointer) downloads even where it could share: a share
// sheet there asks for an app to send it to.
export function deliveryOf(file, nav = globalThis.navigator, media = globalThis.matchMedia) {
  if (media?.call(globalThis, '(pointer: fine)')?.matches) return 'download';
  return nav?.share && nav.canShare?.({ files: [file] }) ? 'share' : 'download';
}

// Hands a WAV on. Returns how it went: 'shared', 'downloaded', 'cancelled'
// (the sheet was closed: nothing to say) or 'again' (the browser wants a
// fresher tap before it opens the sheet: the file is ready, tap again).
// `download: true` skips the sheet.
export async function saveAudio(blob, name, { navigator: nav, matchMedia: media, download = false } = {}) {
  const file = typeof File === 'function' ? new File([blob], name, { type: 'audio/wav' }) : blob;
  if (!download && deliveryOf(file, nav, media) === 'share') {
    try {
      await (nav ?? globalThis.navigator).share({ files: [file], title: name.replace(/\.wav$/, '') });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      if (err?.name === 'NotAllowedError') return 'again';
      // Any other trouble with the sheet: the file still reaches the person.
    }
  }
  downloadBlob(blob, name);
  return 'downloaded';
}

// The ⬇️ button on Beats and Song: one tap renders (`make` returns
// { blob, name, seconds }, or null after saying why not) and hands the file
// on. If the browser refuses the sheet because the render took too long, the
// button becomes 📤 Send and the next tap opens it at once (or downloads, if
// the sheet is refused again). `say` shows a line to the person; `done(how)`
// logs; `reset` forgets a file made for something since changed.
export function createAudioSaver({ button, make, say, done = () => {}, env = {} }) {
  const label = { text: button.textContent, aria: button.getAttribute('aria-label') };
  let ready = null;
  const reset = () => {
    ready = null;
    button.textContent = label.text;
    if (label.aria) button.setAttribute('aria-label', label.aria);
  };
  async function hand(made, retry) {
    let how = await saveAudio(made.blob, made.name, env);
    if (how === 'again' && retry) how = await saveAudio(made.blob, made.name, { ...env, download: true });
    if (how === 'again') {
      ready = made;
      button.textContent = '📤 Send';
      button.setAttribute('aria-label', `Send ${made.name}`);
      say(`“${made.name}” is ready. Tap 📤 Send to share it.`);
      return;
    }
    reset();
    if (how === 'cancelled') { say(''); return; }
    say(how === 'shared'
      ? `📤 Shared “${made.name}” (${made.seconds.toFixed(1)} s).`
      : `⬇️ Saved “${made.name}” (${made.seconds.toFixed(1)} s). Find it in your downloads.`);
    done(how === 'shared' ? 'share' : 'download');
  }
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    if (ready) { await hand(ready, true); return; }
    button.disabled = true;
    say('Making the file…');
    try {
      const made = await make();
      if (made) await hand(made, false);
    } catch (err) {
      console.error('Making an audio file failed:', err);
      say(`That didn't work (${err.message || err.name}). Try again.`);
    } finally {
      button.disabled = false;
    }
  });
  return { reset };
}
