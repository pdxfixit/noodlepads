// No "My" in the app's words (docs/decisions.md; Ben, 2026-10-26: "be
// consistent about the 'my' prefix"). Each person sees only their own, so
// the labels say 🗂️ Beats, 🗂️ Songs, 🎤 Sounds, ⭐ Voices, not "My …". This
// reads what a person reads: the text and the label attributes in
// index.html, and every string in web/*.js (comments left out). Ids, CSS
// classes and stored keys keep "my" (`my-voice-list`, `my:<id>`,
// `dataset.my`): a "my" joined to a hyphen, a colon or a letter is not a
// word, so it passes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const WEB = new URL('../web/', import.meta.url);
const MY = /(^|[^\w:.-])[Mm]y(?![\w:-])/;

// The text of every string literal in some JavaScript, comments skipped. A
// template's ${…} is code again, so a quote inside it does not end the
// template.
export function stringsOf(src) {
  const out = [];
  let i = 0, prev = '';
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i = src.indexOf('*/', i + 2); i = i < 0 ? src.length : i + 2; continue; }
    if (c === '\'' || c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      out.push(src.slice(i + 1, j)); i = j + 1; prev = c; continue;
    }
    if (c === '`') { const r = template(src, i + 1, out); i = r; prev = c; continue; }
    if (c === '/' && /[(,=:[!&|?{};]|^$/.test(prev)) {   // a regular expression
      let j = i + 1, cls = false;
      while (j < src.length && src[j] !== '\n' && (cls || src[j] !== '/')) {
        if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false;
        j++;
      }
      i = j + 1; prev = '/'; continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

// A template literal from `i` (after its backtick): its text goes in `out`
// without the ${…} parts, whose own strings are found by calling stringsOf.
function template(src, i, out) {
  let text = '';
  while (i < src.length && src[i] !== '`') {
    if (src[i] === '\\') { text += src.slice(i, i + 2); i += 2; continue; }
    if (src[i] === '$' && src[i + 1] === '{') {
      let j = i + 2, n = 1;
      while (j < src.length && n > 0) {
        if (src[j] === '`') j = template(src, j + 1, []) - 1;
        else if (src[j] === '{') n++;
        else if (src[j] === '}') n--;
        j++;
      }
      out.push(...stringsOf(src.slice(i + 2, j - 1)));
      text += ' ';
      i = j; continue;
    }
    text += src[i++];
  }
  out.push(text);
  return i + 1;
}

// What a person reads in a page: its text, and the attributes that speak.
export function wordsOfHtml(html) {
  const page = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[\s\S]*?<\/\1>/g, '');
  const out = [...page.matchAll(/>([^<]+)</g)].map((m) => m[1]);
  for (const m of page.matchAll(/\s(?:aria-label|title|placeholder|alt|data-word|aria-description)="([^"]*)"/g)) out.push(m[1]);
  return out;
}

test('no "My" in what index.html shows', () => {
  const words = wordsOfHtml(readFileSync(new URL('index.html', WEB), 'utf8'));
  assert.ok(words.length > 200, 'its words were found');
  assert.deepEqual(words.filter((w) => MY.test(w)), []);
});

test('no "My" in any string in web/*.js', () => {
  let seen = 0;
  const found = [];
  for (const f of readdirSync(WEB).filter((n) => n.endsWith('.js'))) {
    for (const s of stringsOf(readFileSync(new URL(f, WEB), 'utf8'))) {
      seen++;
      if (MY.test(s)) found.push(`${f}: ${s.slice(0, 80)}`);
    }
  }
  assert.ok(seen > 5000, 'the strings were found');
  assert.deepEqual(found, []);
});

test('the check finds a "My" a person reads, and passes ids and comments', () => {
  const src = [
    '// 🗂️ My beats in a comment', '/* My songs */',
    'const a = "🗂️ My beats";', 'const b = `Kept in ${x ? \'🗂️ My songs\' : ""}.`;',
    'const c = \'my-voice-list\';', 'const d = `my:${id}`;', 'const e = /My x/.test(y);', 'const f = "Into my scratch";',
  ].join('\n');
  assert.deepEqual(stringsOf(src).filter((s) => MY.test(s)), ['🗂️ My beats', '🗂️ My songs', 'Into my scratch']);
  assert.ok(wordsOfHtml('<p aria-label="My voices">Hi</p><!-- My x --><p class="my-voice">Ok</p>').some((w) => MY.test(w)));
  assert.deepEqual(wordsOfHtml('<ul id="my-voice-list" class="my-voices">A</ul><!-- My x -->').filter((w) => MY.test(w)), []);
});
