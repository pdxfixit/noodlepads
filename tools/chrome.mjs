// A private headless Chrome and the DevTools protocol, for tools/look.mjs
// (`just look`) and its cloud checks (look-cloud.mjs). Node with no
// dependencies: Node's own WebSocket and fetch. Chrome comes from $CHROME,
// else the usual macOS path. Each run gets its own throwaway profile, removed
// on exit, so agents never share a browser.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

// `fn` until it gives something truthy, or an error after `ms`.
export async function waitFor(what, fn, ms = 15000) {
  const end = Date.now() + ms;
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch { /* not up yet */ }
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(100);
  }
}

// Starts Chrome. Returns {devPort, page(), browser()}: the WebSocket URL of
// its first tab, or of the browser itself (for browser contexts). Chrome and
// its profile go when the process exits, Ctrl-C included.
export async function launchChrome() {
  if (!fs.existsSync(CHROME)) throw new Error(`no Chrome at ${CHROME}; set CHROME=/path/to/chrome`);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'look-chrome-'));
  const proc = spawn(CHROME, [
    '--headless', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--mute-audio', `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank',
  ], { stdio: 'ignore' });
  process.on('exit', () => {
    try { proc.kill('SIGKILL'); } catch { /* already gone */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold a file */ }
  });
  // Chrome picks its own debugging port and writes it to DevToolsActivePort.
  const devPort = await waitFor('Chrome', () => fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
  const http = (p) => fetch(`http://127.0.0.1:${devPort}${p}`).then((r) => r.json());
  return {
    devPort,
    page: async () => (await waitFor('a Chrome tab', async () => (await http('/json/list')).find((t) => t.type === 'page'))).webSocketDebuggerUrl,
    browser: async () => (await waitFor('Chrome', () => http('/json/version'))).webSocketDebuggerUrl,
  };
}

// A DevTools connection. send(method, params, sessionId?) answers with the
// result or throws its error; every event goes to each of `listeners`.
// With a browser connection, session(id) is one attached tab (flatten mode).
export async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let nextId = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    } else if (m.method) for (const fn of [...listeners]) fn(m);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });
  const session = (sessionId) => ({
    send: (method, params) => send(method, params, sessionId),
    on: (fn) => listeners.push((m) => { if (m.sessionId === sessionId) fn(m); }),
  });
  return { send, listeners, session, close: () => ws.close() };
}

// Runs `expression` in the page (awaiting a promise) and gives its value, or
// throws the page's error.
export async function evaluate(send, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
