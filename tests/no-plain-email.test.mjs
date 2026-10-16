// The PIN-reset address is never written out in a tracked file, so a spam harvester that reads the page, its
// scripts or this public repo finds none (Ben, 2026-10-16: "consider protecting the email address from scrapers").
// web/contact.js keeps it reversed and base64-encoded and builds it; Help and the PIN pad take it from there.
// A GitHub no-reply address and the agent co-author line are not mailboxes and are allowed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PIN_RESET_EMAIL } from '../web/contact.js';

const root = new URL('..', import.meta.url).pathname;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const ALLOWED = /@users\.noreply\.github\.com$|^noreply@anthropic\.com$/;

test('no tracked file holds a plain email address', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean)
    .filter((f) => !/\.(png|ico|webp|woff2?|jpg|jpeg|gif|zip|mp3|ogg|wav|m4a)$/i.test(f));
  const found = [];
  for (const f of files) {
    let text;
    try { text = readFileSync(root + f, 'utf8'); } catch { continue; }
    for (const m of text.match(EMAIL) ?? []) if (!ALLOWED.test(m)) found.push(`${f}: ${m.replace(/^.{3}/, '***')}`);
  }
  assert.deepEqual(found, [], 'write the address only through web/contact.js (PIN_RESET_EMAIL), never as text');
});

test('the PIN-reset address is built from the encoded constant, and Help and the PIN pad show it', () => {
  assert.match(PIN_RESET_EMAIL, /^[a-z.]+@[a-z.]+$/, 'PIN_RESET_EMAIL decodes to an address');
  for (const f of ['web/help.js', 'web/cloud-ui.js']) {
    assert.match(readFileSync(root + f, 'utf8'), /import \{ PIN_RESET_EMAIL \} from '\.\/contact\.js'/, `${f} takes it from contact.js`);
  }
});
