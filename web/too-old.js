// The browser floor (docs/decisions.md, Screens): Noodle Pads needs about
// Chrome 117, Firefox 115 or Safari 16.4. An older browser half-draws the
// page, so this shows a grown-up a plain notice instead, and marks the page
// (data-too-old on <html>) so app.js does not start.
//
// A classic script, deferred in index.html just before app.js, so it runs
// first, once the page is parsed. It is written for the oldest browsers
// (var and plain functions, nothing newer), since the browsers it is for are
// the ones that cannot read the modules. It can also be loaded as a module
// (tests/modules.test.mjs) or run on stand-ins (tests/too-old.test.mjs).
//
// Each check is a feature the app leans on that every browser at the floor
// has. :has() (Firefox 121) and @scope (the pad skins) are newer than the
// floor in some browsers, and the app gets by without them, so they are not
// checked.

var TOO_OLD_NEEDS = [
  ['CSS subgrid', function (w) { return w.CSS.supports('grid-template-columns', 'subgrid'); }],
  ['CSS color-mix()', function (w) { return w.CSS.supports('color', 'color-mix(in srgb, red, blue)'); }],
  ['CSS container queries', function (w) { return w.CSS.supports('container-type', 'inline-size'); }],
  ['CSS dvh', function (w) { return w.CSS.supports('height', '100dvh'); }],
  ['Array findLast', function (w) { return typeof w.Array.prototype.findLast === 'function'; }],
  ['Array at', function (w) { return typeof w.Array.prototype.at === 'function'; }],
  ['structuredClone', function (w) { return typeof w.structuredClone === 'function'; }],
  ['inert', function (w) { return 'inert' in w.HTMLElement.prototype; }],
];

var TOO_OLD_WORDS = 'This browser is too old for Noodle Pads. Update it, or open noodlepads.com in a newer Chrome, Firefox or Safari.';

// The names of the checks this window fails; none when it is new enough.
// A check that throws (no CSS object at all, say) counts as failed. Pure.
function tooOldMissing(w) {
  var missing = [];
  for (var i = 0; i < TOO_OLD_NEEDS.length; i++) {
    var ok = false;
    try { ok = !!TOO_OLD_NEEDS[i][1](w); } catch (e) { ok = false; }
    if (!ok) missing.push(TOO_OLD_NEEDS[i][0]);
  }
  return missing;
}

// Checks the window and, when it is too old, marks the page and shows the
// notice. styles.css hides everything else in the body. True when it did.
function tooOldCheck(w, doc) {
  var missing = tooOldMissing(w);
  if (!missing.length) return false;
  doc.documentElement.setAttribute('data-too-old', missing.join(', '));
  var p = doc.createElement('p');
  p.className = 'notice too-old';
  p.setAttribute('role', 'alert');
  p.textContent = TOO_OLD_WORDS;
  doc.body.appendChild(p);
  return true;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.body) {
  tooOldCheck(window, document);
}
