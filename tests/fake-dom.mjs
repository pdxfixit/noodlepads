// A very small stand-in for the browser page, just enough to run app.js in
// Node: elements that remember their children, attributes, classes and event
// handlers, with the handful of selectors the app uses. It is not a DOM and
// does no layout; it exists so the whole app can be started and poked, which
// catches the mistakes tests of single modules cannot (a renamed export, an
// element that was never looked up, a handler wired to nothing).

import { readFileSync } from 'node:fs';
import { onFileEnd } from './file-end.mjs';

const webDir = new URL('../web/', import.meta.url);

// One simple selector (no spaces, no commas): tag, #id, .class and [attr] / [attr="v"] in any mix.
function matcher(selector) {
  const bare = selector.replace(/\[[^\]]*\]/g, '').replace(/:not\([^)]*\)/g, '');  // a "#" inside [attr="#fff"] is not an id
  const tag = bare.match(/^[a-z][a-z0-9-]*/i)?.[0];
  const id = bare.match(/#([\w-]+)/)?.[1];
  const classes = [...bare.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  const attrs = [...selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map((m) => [m[1], m[2]]);
  const not = selector.match(/:not\(([^)]*)\)/)?.[1];
  const notMatch = not === ':disabled' ? (el) => el.disabled : not ? matcher(not) : null;
  return (el) => (!tag || el.tagName === tag.toUpperCase())
    && (!id || el.id === id)
    && classes.every((c) => el.classList.contains(c))
    && attrs.every(([name, value]) => (value === undefined ? el.hasAttribute(name) : el.getAttribute(name) === value))
    && (!notMatch || !notMatch(el));
}

const camel = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

// A real querySelectorAll returns a NodeList: forEach, length, indexing and
// iteration, but no map, indexOf or filter. App code that calls one throws in
// a browser (a problem report caught `items.indexOf` in pads.js, 2026-10-11),
// so here it throws too when the caller is a web/ module. Tests may still use
// array methods on the result.
const ARRAY_ONLY = ['map', 'filter', 'indexOf', 'lastIndexOf', 'find', 'findIndex', 'findLast', 'findLastIndex', 'some', 'every',
  'reduce', 'reduceRight', 'includes', 'slice', 'at', 'flat', 'flatMap', 'join', 'concat', 'sort', 'reverse', 'splice', 'push', 'pop',
  'shift', 'unshift', 'fill', 'toSorted', 'toReversed'];
function nodeList(items) {
  for (const name of ARRAY_ONLY) {
    Object.defineProperty(items, name, {
      configurable: true,
      value(...args) {
        const caller = new Error().stack.split('\n')[2] ?? '';
        if (/\/web\/[^/]+\.js/.test(caller)) throw new TypeError(`a NodeList has no ${name}() (called from ${caller.trim()})`);
        return Array.prototype[name].apply(this, args);
      },
    });
  }
  return items;
}

class ClassList {
  constructor() { this.set = new Set(); }
  add(...c) { c.forEach((x) => this.set.add(x)); }
  remove(...c) { c.forEach((x) => this.set.delete(x)); }
  contains(c) { return this.set.has(c); }
  toggle(c, force) {
    const on = force ?? !this.set.has(c);
    if (on) this.set.add(c); else this.set.delete(c);
    return on;
  }
  get value() { return [...this.set].join(' '); }
}

export class FakeElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.parent = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.classList = new ClassList();
    this.style = { props: {}, setProperty(k, v) { this.props[k] = v; }, getPropertyValue(k) { return this.props[k] == null ? '' : String(this.props[k]); } };
    this.textContent = '';
    this.value = '';
    this.files = [];
    this.focused = false;
    const dataset = {};
    // dataset.fooBar <-> data-foo-bar, like the real thing.
    this.dataset = new Proxy(dataset, {
      set: (t, k, v) => { t[k] = String(v); this.attributes.set(`data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, String(v)); return true; },
      deleteProperty: (t, k) => { delete t[k]; this.attributes.delete(`data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`); return true; },
    });
  }

  // Boolean attributes: `el.hidden = true` and [hidden] stay the same thing.
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(v) { this.#flag('hidden', v); }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(v) { this.#flag('disabled', v); }
  get open() { return this.hasAttribute('open'); }
  set open(v) { this.#flag('open', v); }
  #flag(name, on) { if (on) this.attributes.set(name, ''); else this.attributes.delete(name); }

  get className() { return this.classList.value; }
  set className(v) { this.classList = new ClassList(); this.classList.add(...String(v).split(/\s+/).filter(Boolean)); }
  get firstElementChild() { return this.children[0] ?? null; }
  get lastElementChild() { return this.children.at(-1) ?? null; }
  get isConnected() { let e = this; while (e.parent) e = e.parent; return e === document.documentElement || e === document.body; }

  setAttribute(k, v) {
    this.attributes.set(k, String(v));
    if (k.startsWith('data-')) this.dataset[camel(k.slice(5))] = String(v);
  }
  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
  hasAttribute(k) { return this.attributes.has(k); }
  removeAttribute(k) {
    if (k.startsWith('data-')) delete this.dataset[camel(k.slice(5))];
    this.attributes.delete(k);
  }

  append(...nodes) { for (const n of nodes) this.#adopt(n); }
  replaceChildren(...nodes) {
    for (const c of this.children) c.parent = null;
    this.children = [];
    this.append(...nodes);
  }
  #adopt(n) {
    if (typeof n === 'string' || !(n instanceof FakeElement)) return;  // comments, text
    n.parent?.children.splice(n.parent.children.indexOf(n), 1);
    n.parent = this;
    this.children.push(n);
  }
  replaceWith(other) {
    const p = this.parent;
    if (!p || !(other instanceof FakeElement)) return;
    other.parent?.children.splice(other.parent.children.indexOf(other), 1);
    p.children.splice(p.children.indexOf(this), 1, other);
    other.parent = p;
    this.parent = null;
  }
  get parentElement() { return this.parent; }
  remove() {
    this.parent?.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  insertAdjacentElement(where, el) {
    el.parent?.children.splice(el.parent.children.indexOf(el), 1);
    const p = this.parent;
    const i = p.children.indexOf(this);
    p.children.splice(where === 'beforebegin' ? i : i + 1, 0, el);
    el.parent = p;
  }

  contains(el) { for (let e = el; e; e = e.parent) if (e === this) return true; return false; }
  // Does this element match a selector of simple parts joined by spaces
  // (descendant combinator), the last part being this element?
  matches(selector) {
    // A list ("a, b") matches when any of its selectors does, as in a
    // browser. Without this a list matched nothing here, so app code using
    // one passed in the browser and silently did nothing in the tests.
    const list = selector.split(/,(?![^[(]*[\])])/);
    if (list.length > 1) return list.some((s) => this.matches(s));
    const parts = selector.trim().split(/\s+/);
    if (!matcher(parts.pop())(this)) return false;
    let e = this.parent;
    while (parts.length && e) {
      if (matcher(parts.at(-1))(e)) parts.pop();
      e = e.parent;
    }
    return parts.length === 0;
  }
  closest(selector) {
    for (let e = this; e; e = e.parent) if (e.matches(selector)) return e;
    return null;
  }
  querySelectorAll(selector) {
    const out = [];
    const walk = (e) => { for (const c of e.children) { if (c.matches(selector)) out.push(c); walk(c); } };
    walk(this);
    return nodeList(out);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  removeEventListener() {}
  focus() { this.focused = true; document.activeElement = this; }
  select() {}
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatch('close'); }
  click() { this.dispatch('click', { detail: 0 }); }
  // A real Event sent by code (new Event('change', { bubbles: true })).
  dispatchEvent(ev) { return !this.dispatch(ev.type).defaultPrevented; }

  // Runs this element's handlers, then its ancestors' (bubbling), as a browser would.
  dispatch(type, props = {}) {
    const event = {
      type, target: this, defaultPrevented: false, button: 0, detail: 1, ...props,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.stopped = true; },
    };
    for (let e = this; e && !event.stopped; e = e.parent) {
      for (const fn of e.listeners.get(type) ?? []) fn(event);
    }
    return event;
  }
}

// Builds the page's elements from web/index.html, so ids, nesting and
// attributes are the real ones.
const VOID = new Set(['meta', 'link', 'input', 'br', 'img', 'hr']);
function buildPage(head, body) {
  const html = readFileSync(new URL('index.html', webDir), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|noscript)\b[\s\S]*?<\/\1>/g, '');
  let top = head;
  const stack = [head];
  for (const m of html.matchAll(/<(\/?)([a-z][a-z0-9-]*)([^>]*)>|([^<]+)/gi)) {
    const [, closing, name, attrText, text] = m;
    if (text !== undefined) { top.textContent += text.replace(/\s+/g, ' ').trim(); continue; }
    const tag = name.toLowerCase();
    if (tag === 'html' || tag === 'head' || tag === 'body') {
      if (!closing && tag === 'body') { stack.length = 0; stack.push(body); top = body; }
      continue;
    }
    if (closing) {
      if (!VOID.has(tag)) { stack.pop(); top = stack.at(-1); }
      continue;
    }
    const el = new FakeElement(tag);
    for (const a of attrText.matchAll(/([\w:-]+)(?:\s*=\s*"([^"]*)")?/g)) {
      const [, k, v = ''] = a;
      if (k === 'id') el.id = v;
      else if (k === 'class') el.className = v;
      else el.setAttribute(k, v);
      if (/^(min|max|step)$/.test(k)) el[k] = v;   // a slider's range, read as properties
    }
    top.append(el);
    if (!VOID.has(tag)) { stack.push(el); top = el; }
  }
}

// ── Work in flight, for settle() ──
//
// settle() waits until the page has nothing left to do, not for a fixed time:
// a fixed 20 ms wait lost the race on a busy machine (start-up, a chain of
// storage steps, a fetch, a PIN hash). What counts as work in flight:
//   - a fetch (whatever function is in globalThis.fetch, set before or after
//     installPage) until its promise settles;
//   - a crypto.subtle call (a PIN's PBKDF2 hash runs off the main thread);
//   - a one-shot timer due within WORK_MS: a zero-delay step of the app, or a
//     stand-in's step (fake IndexedDB answers with setTimeout(fn));
//   - any timer set by a stand-in (tests/fake-*.mjs), whatever its delay, so
//     a slowed stand-in is still waited for.
// What does not count, so settle() never waits on it: repeating work
// (setInterval, and timers set while an interval's callback runs: the
// sequencer's tick, update checks, the recording count), and the app's own
// one-shot timers due later than WORK_MS (a hold, a fade, an Undo offer, a
// notice hiding). Those are things the test chooses to wait for, as before.
// The page is settled once nothing counted has been pending, and nothing new
// has begun, for QUIET_MS (checked every POLL_MS). So settle() is never
// shorter than the old 20 ms wait. After CAP_MS it fails, naming what was
// still pending.
const WORK_MS = 20;
const QUIET_MS = 20;
const POLL_MS = 4;
const CAP_MS = 10_000;
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const realSetInterval = globalThis.setInterval;
// ── Letting the file end ──
//
// The app starts intervals (the sequencer's tick, the play watch, update
// checks, the nudge) and one-shot timers (holds, fades, an Undo offer) that
// nothing in a test stops, and Node waits for every timer. Every timer set
// while the page is installed is kept here, and tests/file-end.mjs clears them
// when the file's tests are done, so the file ends by itself.
const liveTimers = new Set();
export function teardown() {
  const stopped = [...liveTimers].map((t) => `${t._repeat ? 'an interval' : 'a timer'} of ${t._idleTimeout} ms`);
  for (const t of liveTimers) realClearTimeout(t);   // also stops an interval
  liveTimers.clear();
  return stopped.length ? `${stopped.length} page timer${stopped.length > 1 ? 's' : ''} (${[...new Set(stopped)].slice(0, 4).join(', ')})` : '';
}
onFileEnd(teardown);
const work = { pending: new Map(), begun: 0, next: 1, periodic: 0 };

function begin(label) {
  const id = work.next++;
  work.pending.set(id, label);
  work.begun++;
  return id;
}
const end = (id) => { work.pending.delete(id); };
function track(promise, label) {
  const id = begin(label);
  return Promise.resolve(promise).finally(() => end(id));
}
// Where a timer was set: the first frame outside this file and node itself.
// `trace` is an Error made when it was set; reading its stack is the slow
// part, so it is read only for a long timer or a failure message.
function caller(trace) {
  const lines = trace.stack.split('\n').slice(1);
  return (lines.find((l) => !l.includes('fake-dom.mjs') && !l.includes('node:')) ?? '').trim().replace(/^at /, '');
}

let watching = false;
function watchWork() {
  if (watching) return;
  watching = true;
  const timers = new Map();   // Node's Timeout -> work id
  // A timer that has fired is forgotten, so a long file keeps no pile of them.
  const kept = (t) => { liveTimers.add(t); return t; };
  const once = (fn) => function fired(...a) { liveTimers.delete(this); return fn.apply(this, a); };
  globalThis.setTimeout = function setTimeout(fn, ms, ...args) {
    if (work.periodic > 0 || typeof fn !== 'function') return kept(realSetTimeout(typeof fn === 'function' ? once(fn) : fn, ms, ...args));
    const trace = new Error();
    const delay = Number(ms) || 0;
    if (delay > WORK_MS && !/\/tests\/fake-[^/]*\.mjs/.test(caller(trace))) return kept(realSetTimeout(once(fn), ms, ...args));
    const id = begin({ toString: () => `a ${delay} ms timer set at ${caller(trace)}` });
    const t = realSetTimeout(function fired(...a) {
      timers.delete(t);
      liveTimers.delete(t);
      try { fn.apply(this, a); } finally { end(id); }
    }, ms, ...args);
    timers.set(t, id);
    return kept(t);
  };
  globalThis.clearTimeout = function clearTimeout(t) {
    for (const [timer, id] of timers) {
      if (timer === t || (typeof t === 'number' && +timer === t)) { timers.delete(timer); end(id); }
    }
    liveTimers.delete(t);
    return realClearTimeout(t);
  };
  const realClearInterval = globalThis.clearInterval;
  globalThis.clearInterval = function clearInterval(t) {
    liveTimers.delete(t);
    return realClearInterval(t);
  };
  globalThis.setInterval = function setInterval(fn, ms, ...args) {
    if (typeof fn !== 'function') return kept(realSetInterval(fn, ms, ...args));
    return kept(realSetInterval((...a) => {
      work.periodic++;
      try { fn(...a); } finally { work.periodic--; }
    }, ms, ...args));
  };
  // fetch: tracked whatever function a test puts there later.
  const wrapFetch = (fn) => {
    if (typeof fn !== 'function' || fn.tracked) return fn;
    // The body is work too: `await res.json()` after the answer reads a stream,
    // which takes event-loop turns of its own. Untracked, a page that was
    // descheduled for 20 ms right there looked settled before it went on.
    const wrapped = (url, ...rest) => track(Promise.resolve(fn(url, ...rest)).then((res) => {
      for (const read of ['json', 'text', 'arrayBuffer', 'blob', 'formData']) {
        if (typeof res?.[read] !== 'function') continue;
        const real = res[read].bind(res);
        res[read] = (...a) => track(real(...a), `a ${read}() of ${String(url).slice(0, 60)}`);
      }
      return res;
    }), `a fetch of ${String(url).slice(0, 80)}`);
    wrapped.tracked = true;
    return wrapped;
  };
  let fetchFn = wrapFetch(globalThis.fetch);
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    get: () => fetchFn,
    set: (fn) => { fetchFn = wrapFetch(fn); },
  });
  for (const fn of ['deriveBits', 'digest', 'importKey', 'sign', 'verify', 'encrypt', 'decrypt', 'exportKey', 'generateKey', 'deriveKey']) {
    const real = crypto.subtle[fn]?.bind(crypto.subtle);
    if (real) crypto.subtle[fn] = (...args) => track(real(...args), `crypto.subtle.${fn}`);
  }
}

const sleep = (ms) => new Promise((resolve) => realSetTimeout(resolve, ms));

// The settled page (see "Work in flight" above).
export async function settle() {
  const start = Date.now();
  let calmSince = start;
  let was = work.begun;
  for (;;) {
    await sleep(POLL_MS);
    const now = Date.now();
    if (work.pending.size > 0 || work.begun !== was) { calmSince = now; was = work.begun; }
    else if (now - calmSince >= QUIET_MS) return;
    if (now - start > CAP_MS) {
      const left = [...work.pending.values()].map(String);
      throw new Error(`the page never settled in ${CAP_MS / 1000} s: ${left.length ? `still pending: ${[...new Set(left)].slice(0, 5).join('; ')}` : 'new work kept starting'}`);
    }
  }
}

// Installs the page globals and returns helpers. Call before importing app.js.
// `manifest` is served as boards.json in place of the real file.
// `firstSteps`: a new person's welcome, tips, hint dots and nudge (ADR 0028,
// web/firsts.js). Off unless a test asks, through the app's test hook
// (`noodleFirstSteps`), so the app starts as a fresh device always did and
// the other tests' first taps land on the app, not on the welcome.
export function installPage({ hash = '', storage, manifest, firstSteps = false } = {}) {
  watchWork();
  globalThis.noodleFirstSteps = firstSteps;
  const root = new FakeElement('html');
  const body = new FakeElement('body');
  const head = new FakeElement('head');
  root.append(head, body);
  const docListeners = new Map();

  globalThis.document = {
    documentElement: root,
    body,
    activeElement: null,
    title: '',
    createElement: (tag) => new FakeElement(tag),
    createComment: () => new FakeElement('#comment'),
    querySelector: (selector) => root.querySelector(selector),
    querySelectorAll: (selector) => root.querySelectorAll(selector),
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
  };
  buildPage(head, body);
  const winListeners = new Map();
  const fetched = [];
  Object.assign(globalThis, {
    window: {
      isSecureContext: true,
      // Enough of an AudioContext for the app to start one; it makes no sound.
      AudioContext: class {
        state = 'running'; currentTime = 0; destination = {};
        createGain() { return { connect() {}, gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} } }; }
        createDynamicsCompressor() {
          const param = () => ({ value: 0 });
          return { connect() {}, threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), reduction: 0 };
        }
        createWaveShaper() { return { connect() {}, curve: null, oversample: 'none' }; }
        createAnalyser() { return { connect() {}, fftSize: 0 }; }
        createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { value: 0 } }; }
        resume() { return Promise.resolve(); }
      },
      // `once` is kept, as a browser keeps it: such a listener hears one event.
      addEventListener(type, fn, opts) {
        if (!winListeners.has(type)) winListeners.set(type, []);
        if (opts?.once) {
          const once = (e) => { winListeners.set(type, winListeners.get(type).filter((f) => f !== once)); return fn(e); };
          once.orig = fn;
          winListeners.get(type).push(once);
        } else winListeners.get(type).push(fn);
      },
      removeEventListener(type, fn) {
        winListeners.set(type, (winListeners.get(type) ?? []).filter((f) => f !== fn && f.orig !== fn));
      },
    },
    matchMedia: () => ({ matches: false }),
    location: { hash },
    history: { replaceState: (_s, _t, url) => { globalThis.location.hash = url; } },
    CSS: { escape: (s) => String(s).replace(/"/g, '\\"'), supports: (_p, v) => /^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(v) },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    fetch: async (url) => {
      fetched.push(String(url));
      const file = new URL(String(url), webDir);
      if (file.protocol === 'file:' && String(url) === 'boards.json') {
        return { ok: true, status: 200, json: async () => manifest ?? JSON.parse(readFileSync(file, 'utf8')) };
      }
      // version.json is never served: `just deploy` writes one into web/, and
      // the tests must not depend on whether this checkout has deployed.
      return { ok: false, status: 404 };
    },
  });
  // Node has its own navigator, which is read-only; the page's has no media devices.
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
  if (storage) globalThis.localStorage = storage;

  return {
    $: (selector) => globalThis.document.querySelector(selector),
    body,
    fetched,
    // Key presses go to the document, as the page's own shortcuts expect.
    key(key, props = {}) {
      const event = {
        type: 'keydown', key, target: props.target ?? body, defaultPrevented: false,
        metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...props,
        preventDefault() { this.defaultPrevented = true; },
      };
      for (const fn of docListeners.get('keydown') ?? []) fn(event);
      return event;
    },
    docEvent(type, props = {}) {
      for (const fn of docListeners.get(type) ?? []) fn({ type, ...props });
    },
    winEvent(type, props = {}) {
      for (const fn of winListeners.get(type) ?? []) fn({ type, ...props });
    },
    // The settled page: nothing in flight (see "Work in flight" above).
    settle,
  };
}
