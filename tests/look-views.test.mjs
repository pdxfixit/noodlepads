// `just look`'s views (tools/look.mjs VIEWS). No test runs Chrome, so this
// checks the table itself: every view name is taken once (a second one
// replaces the first unseen: `beat` once replaced 🆕 New's view), and the
// names agents and the docs use still mean what they say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const LOOK = join(root, 'tools/look.mjs');

// The table as look.mjs builds it (`--views PATH` writes it and stops).
function views() {
  const dir = mkdtempSync(join(tmpdir(), 'look-views-'));
  try {
    execFileSync(process.execPath, [LOOK, '--views', join(dir, 'views.json')], { stdio: 'pipe' });
    return JSON.parse(readFileSync(join(dir, 'views.json'), 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The top-level keys of the object literal that starts at `src[at]` ('{'),
// in order, duplicates kept. JavaScript keeps only the last of two equal keys,
// silently, so they are read from the source: strings, templates (with their
// ${…}) and comments are skipped, and only keys at the literal's own depth count.
function literalKeys(src, at) {
  const keys = [];
  let depth = 0;
  let wantKey = false;
  const stack = [];   // what each open ${ … } returns to: 'tpl'
  for (let i = at; i < src.length; i++) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      if (wantKey && depth === 1 && /^\s*:/.test(src.slice(j + 1, j + 40))) { keys.push(src.slice(i + 1, j)); wantKey = false; }
      i = j;
      continue;
    }
    if (c === '`' || (c === '}' && stack.at(-1) === 'tpl')) {
      if (c === '}') stack.pop();
      let j = i + 1;
      while (src[j] !== '`' && !(src[j] === '$' && src[j + 1] === '{')) j += src[j] === '\\' ? 2 : 1;
      if (src[j] === '$') { stack.push('tpl'); j++; }
      i = j;
      continue;
    }
    if ('{[('.includes(c)) { depth++; stack.push('code'); if (depth === 1) wantKey = true; continue; }
    if ('}])'.includes(c)) { depth--; stack.pop(); if (depth === 0) return keys; continue; }
    if (c === ',' && depth === 1) { wantKey = true; continue; }
    if (wantKey && depth === 1 && /[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
      if (/^\s*:/.test(src.slice(i + m[0].length, i + m[0].length + 40))) keys.push(m[0]);
      wantKey = false;
      i += m[0].length - 1;
    }
  }
  throw new Error('the object literal never closes');
}

test('literalKeys finds a key used twice in an object literal, wherever it sits', () => {
  const src = "const T = { a: 1, 'b-c': { a: 2 }, d: `x ${ { a: 3 } } y`, // a: 4\n  e: [1, { a: 5 }],\n    a: 6 };";
  assert.deepEqual(literalKeys(src, src.indexOf('{')), ['a', 'b-c', 'd', 'e', 'a']);
});

test('every view in the table is named once (a second key would replace the first)', () => {
  const src = readFileSync(LOOK, 'utf8');
  const names = literalKeys(src, src.indexOf('{', src.indexOf('const VIEWS = {')));
  assert.ok(names.length > 50, `found only ${names.length} views in the table`);
  const twice = names.filter((n, i) => names.indexOf(n) !== i);
  assert.deepEqual(twice, [], `views named twice in look.mjs VIEWS: ${twice.join(', ')}`);
});

test('look.mjs builds its views without a clash, and the names in use mean what they say', () => {
  const v = views();   // throws when a view built after the table takes a name already used
  assert.deepEqual(v.beat, v.beats, '`just look beat` is the Beats screen, as `just look beats`');
  assert.equal(v.dj.screen, 'live', '`dj` is the old name of 🎤 Live');
  assert.match(v['beat-new'].js, /\[data-beat-new\]/, 'beat-new taps 🆕 New in the beat bar');
  for (const [name, view] of Object.entries(v)) {
    assert.ok(['pads', 'beats', 'song', 'live'].includes(view.screen), `${name}: no screen called ${view.screen}`);
  }
});

// What the views (tools/look.mjs) and the live checks (tools/look-cloud.mjs)
// reach into in web/, by string: module exports, `state` fields, and the ids,
// classes and data- attributes of their selectors. A rename in web/ passes
// every other test; here it fails, before a view says "script failed" or the
// live e2e check fails after a deploy.
//
// The scripts are read in units a module alias stays inside: each view's
// script (whole, from --views), each line of look.mjs, and look-cloud.mjs
// whole (its `cloud` alias is shared by its scripts).
function reaches(units) {
  const imports = [];   // [module, name, where]
  const fields = [];    // [field of state.js state, where]
  const selectors = []; // [selector, where]
  const word = '[A-Za-z_$][\\w$]*';
  for (const [where, text] of units) {
    for (const m of text.matchAll(/(?:const|let)\s*\{([^}]*)\}\s*=\s*await import\('\/([\w-]+\.js)'\)/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s*:\s*/)[0];
        if (name) imports.push([m[2], name, where]);
      }
    }
    for (const m of text.matchAll(/\(await import\('\/([\w-]+\.js)'\)\)\.([A-Za-z_$][\w$]*)/g)) imports.push([m[1], m[2], where]);
    for (const m of text.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*await import\('\/([\w-]+\.js)'\)/g)) {
      // `(?<![\w$./-])`: not `x.cloud.set`, not the `ui.js` of '/cloud-ui.js'.
      for (const u of text.matchAll(new RegExp(`(?<![\\w$./-])${m[1].replace(/\$/g, '\\$')}\\.(${word})`, 'g'))) {
        imports.push([m[2], u[1], where]);
      }
    }
    if (/\{[^}]*\bstate\b[^}]*\}\s*=\s*await import\('\/state\.js'\)/.test(text)) {
      for (const m of text.matchAll(/(?<![\w$./-])state\.([A-Za-z_$][\w$]*)/g)) fields.push([m[1], where]);
    }
    for (const m of text.matchAll(/(?:querySelector(?:All)?|closest|matches|\bq)\(\s*(?:JSON\.stringify\()?(['"`])((?:\\.|(?!\1).)*)\1/g)) {
      selectors.push([m[2].replace(/\$\{[^}]*\}/g, ''), where]);
    }
  }
  return { imports, fields, selectors };
}

// The parts of a selector the page must have (attribute values left out).
function namesIn(selector) {
  const plain = selector.replace(/\\(["'])/g, '$1').replace(/(["'])(?:(?!\1).)*\1/g, '""');
  return {
    ids: [...plain.matchAll(/#([A-Za-z][\w-]*)/g)].map((m) => m[1]),
    classes: [...plain.matchAll(/(?<![\w-])\.([A-Za-z][\w-]*)/g)].map((m) => m[1]),
    data: [...plain.matchAll(/\[(data-[\w-]+)/g)].map((m) => m[1]),
  };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Names the tools give elements they make themselves (just taps' veil over
// the pads), so web/ never has them. Only these are passed, and only while
// web/ does not use the name: a name web/ shares is checked like any other.
const TOOLS_OWN = ['.tap-check-veil'];
function ownedByTools(name, tools, web) {
  const bare = name.slice(1);
  const made = name[0] === '.'
    ? [...tools.matchAll(/className\s*=\s*['"]([\w -]+)['"]/g)].some(([, list]) => list.split(/\s+/).includes(bare))
    : new RegExp(`\\.id\\s*=\\s*['"]${esc(bare)}['"]`).test(tools);
  return made && !new RegExp(`(?<![\\w-])${esc(bare)}(?![\\w-])`).test(web);
}

test('a name the tools make is passed only while web/ does not use it', () => {
  const tools = "v.className = 'tap-check-veil'; p.className = 'pad';";
  assert.equal(ownedByTools('.tap-check-veil', tools, '<div class="pad">'), true);
  assert.equal(ownedByTools('.pad', tools, '<div class="pad">'), false, 'a class web/ has too is still checked');
  assert.equal(ownedByTools('.ghost', tools, ''), false, 'a class the tools never make is not theirs');
});

test('what just look and the live checks reach into in web/ is still there', async () => {
  const look = readFileSync(LOOK, 'utf8');
  const cloud = readFileSync(join(root, 'tools/look-cloud.mjs'), 'utf8');
  const units = [...Object.entries(views()).map(([name, v]) => [`look.mjs view ${name}`, v.js]),
    ...look.split('\n').map((line, i) => [`look.mjs:${i + 1}`, line]), ['look-cloud.mjs', cloud]];
  const { imports, fields, selectors } = reaches(units);
  assert.ok(imports.length > 50 && fields.length > 50 && selectors.length > 500,
    `found too little to check (${imports.length} imports, ${fields.length} fields, ${selectors.length} selectors): has the scripts' shape changed?`);
  const missing = [];
  for (const [mod, name, where] of imports) {
    const m = await import(join(root, 'web', mod));
    if (!(name in m)) missing.push(`${where}: ${mod} has no export ${name}`);
  }
  const { state } = await import(join(root, 'web/state.js'));
  for (const [field, where] of fields) if (!(field in state)) missing.push(`${where}: state.js state has no ${field}`);

  // Where web/ writes an id, a class or a data- attribute: index.html and every module.
  const web = [readFileSync(join(root, 'web/index.html'), 'utf8'),
    ...readdirSync(join(root, 'web')).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(root, 'web', f), 'utf8'))].join('\n');
  // An id is written as id="x", id: 'x', el.id = 'x', or built from a prefix (`inst-list-${group}`).
  const prefixes = [...web.matchAll(/[`"]([A-Za-z][\w-]*-)\$\{/g)].map((m) => m[1]);
  const idMade = (id) => new RegExp(`\\bid\\s*(?:=\\s*\\\\?["'\`]|:\\s*["'\`])${esc(id)}(?![\\w-])`).test(web)
    || prefixes.some((p) => id.startsWith(p) && id.length > p.length);
  const token = (t) => new RegExp(`(?<![\\w-])${esc(t)}(?![\\w-])`).test(web);
  const done = new Set();   // names checked already, or the tools' own
  for (const name of TOOLS_OWN) {
    assert.ok(ownedByTools(name, look + cloud, web), `${name} in TOOLS_OWN must be made by the tools and unknown to web/`);
    done.add(name);
  }
  for (const [selector, where] of selectors) {
    const { ids, classes, data } = namesIn(selector);
    for (const id of ids) if (!done.has(`#${id}`) && (done.add(`#${id}`), !idMade(id))) missing.push(`${where}: no element #${id} in web/ (${selector})`);
    for (const c of classes) if (!done.has(`.${c}`) && (done.add(`.${c}`), !token(c))) missing.push(`${where}: no class ${c} in web/ (${selector})`);
    for (const d of data) {
      const camel = d.slice(5).replace(/-([a-z])/g, (_, x) => x.toUpperCase());
      if (!done.has(d) && (done.add(d), !token(d) && !new RegExp(`dataset\\.${camel}(?![\\w$])`).test(web))) {
        missing.push(`${where}: no ${d} attribute in web/ (${selector})`);
      }
    }
  }
  assert.deepEqual(missing, [], `rename them in tools/ too:\n${missing.join('\n')}`);
});

test('look-cloud.mjs and chrome.mjs load: their imports from web/ are still exported', async () => {
  // A missing named import (cloud-api.js createCloudApi, cloud-sync.js uploadAudio…) or a syntax error throws here.
  const live = await import('../tools/look-cloud.mjs');
  assert.equal(typeof live.main, 'function');
});
