// A small in-memory diary of what the app did, for problem reports:
// errors, warnings and notable events (a beat started, a sound was cut off).
// It leaves the device only cleaned by log-clean.js, when 📮 Send problem
// reports is on. Only the last MAX_ENTRIES are kept, so
// it can't grow without bound.

export const MAX_ENTRIES = 400;
const entries = [];
const started = Date.now();
const listeners = new Set();
let count = 0;  // every entry's `n`, counting up, so a sender knows what it has sent

// kind: a short word ('error', 'warn', 'beat', 'audio', ...); data: anything
// JSON can hold. Large strings are cut, so one bad value can't fill the log.
export function logEvent(kind, data = {}) {
  const entry = { n: ++count, t: Date.now() - started, kind: String(kind).slice(0, 24), data: trim(data) };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  for (const fn of listeners) {
    try { fn(entry); } catch { /* a listener must never stop the log */ }
  }
}

// Calls `fn(entry)` for each new entry; returns a function that stops it.
export function onLog(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getLog() {
  return entries.slice();
}

export function clearLog() {
  entries.length = 0;
}

// Records uncaught errors and rejected promises. Call once at start-up.
export function installErrorLog(target = globalThis) {
  target.addEventListener?.('error', (e) => logEvent('error', { message: e.message, source: e.filename, line: e.lineno }));
  target.addEventListener?.('unhandledrejection', (e) => logEvent('error', { message: String(e.reason?.message || e.reason) }));
}

function trim(value, depth = 0) {
  if (typeof value === 'string') return value.length > 300 ? value.slice(0, 300) + '…' : value;
  if (value === null || typeof value !== 'object') return value;
  if (depth > 3) return '…';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => trim(v, depth + 1));
  return Object.fromEntries(Object.entries(value).slice(0, 30).map(([k, v]) => [k, trim(v, depth + 1)]));
}
