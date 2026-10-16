// Installing Noodle Pads as an app, and opening it with no network: registers
// the service worker (sw.js), which keeps a copy of the whole app and uses it
// only when the network fails. The browser's own install prompt does the rest
// (manifest.webmanifest); the app has no install button.
//
// It registers once the page has finished loading, so the worker's first
// fill of the cache (about 6 MB) never slows the first screen. A browser
// without service workers, a private window that refuses one, or the tests'
// stand-in page: nothing happens, and the app works online as before.

export function registerOffline({
  nav = globalThis.navigator,
  win = globalThis.window,
  doc = globalThis.document,
} = {}) {
  if (!nav || !('serviceWorker' in nav)) return false;
  const go = () => {
    Promise.resolve()
      .then(() => nav.serviceWorker.register('sw.js'))
      .catch(() => { /* refused: the app still works online */ });
  };
  if (doc?.readyState === 'complete') go();
  else win?.addEventListener?.('load', go, { once: true });
  return true;
}
