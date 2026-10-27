// Two versions of the app meeting (reliability, council round 1). The site
// deploys on every push, and a page opened across a deploy can load its
// index.html from one version and some of its modules from the next: a module
// lacks an export the others expect, or a file is gone. The page then shows
// nothing, and a grown-up sees a blank screen. A reload fixes it, so this
// reloads, once.
//
// A classic script, deferred in index.html just before app.js, so its
// listeners are in place before any module runs. It is written for the oldest
// browsers (var and plain functions), as too-old.js is, and can be loaded as a
// module (tests/modules.test.mjs) or run on stand-ins (tests/boot.test.mjs).
//
// It acts only when a module fails to load, never on an ordinary error in
// the app's own code. Then it asks version.json what is live and reloads,
// unless this tab already reloaded for that very version (sessionStorage), so
// it can never loop: a page still broken after its one reload stays as it is.
// With no network, no storage or no version.json there is nothing newer to
// fetch, so it stays too.

var BOOT_FLAG = 'noodlepads-boot-reload';

// What to do once a module failed to load. Pure.
//   failed: a module of this page failed to load
//   live:   the version version.json names now, or null when unknown
//   flag:   the version this tab already reloaded for, or null
// -> 'reload' | 'stay'
function bootDecide(failed, live, flag) {
  if (!failed) return 'stay';
  if (typeof live !== 'string' || live === '' || live === 'dev') return 'stay';
  if (flag === live) return 'stay';
  return 'reload';
}

// True when an event is a module that would not load: a script or link that
// failed to fetch, or the browser's own words for a missing file or export.
// `e` is an error event, a rejection event, or anything shaped like one.
var BOOT_WORDS = /dynamically imported module|importing a module script|module script failed|does not provide an export|requested module|export named|binding name|failed to load module|error loading module/i;
function bootIsLoadFailure(e) {
  if (!e) return false;
  var t = e.target;
  if (t && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) return true;
  var msg = e.message;
  if (!msg && e.reason) msg = e.reason.message || String(e.reason);
  return typeof msg === 'string' && BOOT_WORDS.test(msg);
}

// Wires it to a window. `deps` lets tests drive it:
//   storage() the session storage or null; fetchLive() a promise of the live
//   version or null; reload().
function bootWatch(w, deps) {
  var asked = false;
  function onFail(e) {
    if (asked || !bootIsLoadFailure(e)) return;
    asked = true;
    var store = deps.storage();
    if (!store) return;                      // no way to remember: never risk a loop
    deps.fetchLive().then(function (live) {
      var flag = null;
      try { flag = store.getItem(BOOT_FLAG); } catch (err) { return; }
      if (bootDecide(true, live, flag) !== 'reload') return;
      try { store.setItem(BOOT_FLAG, live); } catch (err) { return; }
      deps.reload();
    }, function () {});
  }
  w.addEventListener('error', onFail, true);
  w.addEventListener('unhandledrejection', onFail);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.documentElement &&
    !document.documentElement.hasAttribute('data-too-old')) {
  bootWatch(window, {
    storage: function () { try { return window.sessionStorage; } catch (err) { return null; } },
    fetchLive: function () {
      return window.fetch('version.json', { cache: 'no-store' }).then(function (res) {
        if (!res.ok || (res.headers && res.headers.get('X-Noodle-Offline'))) return null;
        return res.json().then(function (j) { return j && typeof j.version === 'string' ? j.version : null; });
      }).catch(function () { return null; });
    },
    reload: function () { window.location.reload(); },
  });
}
