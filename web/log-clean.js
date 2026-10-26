// What a problem report may hold: the event log (log.js) cleaned by an
// allowlist, so nothing a person typed or recorded leaves the device. The
// Worker that receives reports runs the same cleanPayload again, so this file
// imports only agent.js (pure) and touches no page or storage.
//
// The rules (docs/design/automatic-logs.md § 2):
// - Each kind of entry lists the fields it may send. An unknown kind is
//   dropped and counted; an unknown field is dropped.
// - Numbers and booleans pass. A string passes only from a fixed list of
//   values; anything else becomes «text».
// - Free text (error messages, notices) is kept with every name known on the
//   device, and every quoted phrase, blanked, then cut to 200 characters.
// - A sound is sent as its kit id (`kick`) or its kind, never its name.
// - A person is sent as true/false and counts, never an id (ids are names).
// - The device is its browser, OS and device-type families (agent.js), never
//   the raw User-Agent string.

import { parseAgent, BROWSERS, SYSTEMS, TYPES } from './agent.js';

export const TEXT_MAX = 200;
export const ENTRIES_MAX = 400;
export const BLANK = '«text»';
export const NAME = '«name»';

// Fixed lists the report may name. Tests check each against the app's own
// list (VOICES, KINDS, SETTINGS, SIGNATURES), so a new voice or setting
// fails a test until it is added here.
export const VOICE_IDS = ['normal', 'loud', 'chipmunk', 'fast', 'slow', 'monster', 'robot', 'stadium', 'walkie',
  'underwater', 'alien', 'clones', 'stutter', 'backwards'];
export const STEP_KINDS = ['pitch', 'stretch', 'tone', 'echo', 'room', 'crunch', 'wobble', 'ring', 'squash', 'fade',
  'reverse', 'repeat'];
export const SIGNATURE_IDS = ['4/4', '3/4', '5/4', '6/8', '7/8'];
export const SETTING_VALUES = {
  level: ['kids', 'regular', 'advanced'],
  advancedBeats: [false, true],
  timeSignature: SIGNATURE_IDS,
  padSize: ['auto', ...Array.from({ length: 101 }, (_, i) => i / 100)],   // 'auto', or 0 to 1 between the screen's smallest and biggest pads
  padSkin: ['tiles', 'slam', 'lit', 'switch', 'spinner', 'jelly', 'googly'],   // skins.js SKIN_IDS
  // instruments.js: who plays Notes, Chords and Bass.
  instNotes: ['pluck', 'piano', 'organ', 'chip', 'marimba', 'steel', 'kalimba', 'guitar', 'strings', 'brass', 'flute'],
  instChords: ['synth', 'piano', 'organ', 'guitar', 'strings'],
  instBass: ['synth', '808', 'upright'],
  djLayout: ['qwerty', 'dvorak'],
  sendLogs: [false, true],
  sendUsage: [false, true],
};
// What a sound that is not from the kit is sent as: a person's sound from
// boards.json, one made with ✨ Make one, or anything else made on the device
// (recorded, a file, a beat or song saved as a sound: the store keeps no
// difference between those).
export const SOUND_KINDS = ['bundled', 'made', 'recorded'];
export const COUNT_KEYS = ['people', 'sounds', 'recorded', 'beats', 'takes', 'songs'];
const AUDIO_STATES = ['running', 'suspended', 'closed', 'interrupted'];

// A sound as a report names it. The sequencer logs this beside the label;
// only this is sent.
export function soundKind(clip) {
  if (!clip) return null;
  if (clip.kit) return clip.kitId ?? 'kit';
  if (clip.source === 'bundled') return 'bundled';
  return clip.synth ? 'made' : 'recorded';
}

// ── Field rules ──

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : undefined);
const bool = (v) => (typeof v === 'boolean' ? v : undefined);
const flag = (v) => (v === undefined ? undefined : !!v);
const oneOf = (list) => (v) => (v === null ? null : list.includes(v) ? v : BLANK);
const nums = (v) => (Array.isArray(v) ? v.slice(0, 8).map((n) => num(n) ?? null) : num(v));

// A voice chain as voices.js logs it: "chipmunk>echo".
function chain(v) {
  if (typeof v !== 'string') return undefined;
  const parts = v.split('>');
  return parts.length <= 8 && parts.every((p) => VOICE_IDS.includes(p) || STEP_KINDS.includes(p)) ? v : BLANK;
}

// The site's own script, by file name; anything else (an extension's script,
// a data: URL) is "external".
function file(v, known) {
  if (typeof v !== 'string' || !v) return undefined;
  if (/^[a-z0-9-]{1,40}\.m?js$/.test(v)) return v;
  try {
    const url = new URL(v);
    const name = url.pathname.split('/').pop();
    if (known.origin && url.origin === known.origin && /^[a-z0-9-]{1,40}\.m?js$/.test(name)) return name;
  } catch { /* not a URL */ }
  return 'external';
}

function sound(v, known) {
  if (v === null) return null;
  if (SOUND_KINDS.includes(v)) return v;
  if (known.kitIds && v !== 'kit') return known.kitIds.has(v) ? v : 'kit';
  return 'kit';
}

const ROW = {
  sound,
  voice: oneOf(VOICE_IDS),
  pills: num, rate: num, ring: bool, muted: bool, volume: num,
};

function rows(v, known) {
  if (!Array.isArray(v)) return undefined;
  // `kind` is what the sequencer logs as the sound's kind. A cleaned row
  // carries it in `sound` instead, so cleaning twice (the app, then the
  // Worker) keeps it. A label there becomes 'kit': names are never sent.
  return v.slice(0, 50).map((r) => fields({ ...r, sound: r?.kind ?? r?.sound ?? null }, ROW, known));
}

const text = (v, known) => (v === undefined || v === null ? undefined : redact(v, known.names));

// Every kind of entry the app logs, and the fields each may send. A test
// reads every logEvent call in web/ and fails on a kind or field missing here.
export const RULES = {
  error: { message: text, storage: text, source: file, line: num },
  notice: { text },
  beat: {
    // switch: a pattern chip's beat taking over at a bar line, `after` bars into the beat before it.
    // groove: one loaded into the scratch (`replaced`: over hits); keep: 💾 Keep (`groove`: from one); new: 🆕 New (`replaced`: emptied a scratch with rows).
    action: oneOf(['play', 'stop', 'sample', 'switch', 'groove', 'keep', 'new']), replaced: bool, groove: bool, bpm: num, bars: num, advanced: bool, mode: oneOf(['plain', 'speed']), after: num,
    signature: oneOf(SIGNATURE_IDS), rows,
    seconds: num, hits: num, cuts: num, maxRinging: num, limiterDb: num,
  },
  // Beat Builder recording into the open beat: start, grow, round (a pass
  // with no hit in the last bar: no more growing) and stop, with why.
  dj: {
    rec: oneOf(['start', 'grow', 'round', 'stop']), why: oneOf(['button', 'escape', 'leave', 'stopped']),
    started: bool, growing: bool, bars: num, bpm: num, added: num, seconds: num,
  },
  // ● Record a take on 🎤 Live: started, and stopped (`made`: a take was kept).
  take: { rec: oneOf(['start', 'stop']), made: bool, seconds: num },
  chop: { found: num, seconds: num, made: num },
  // 🧸 Kids (kids.js): a tab shown, a recording kept (its length, by a tap
  // or a hold) and its voice, the beat played, the grown-up sum answered.
  kids: {
    tab: oneOf(['pads', 'record', 'beats', 'keys']), recorded: num, how: oneOf(['tap', 'hold']), voice: oneOf(['normal', 'robot', 'tiny', 'spooky']),
    play: bool, bpm: num, sum: oneOf(['right', 'wrong']),
    // ● on the Keys screen: a tune recording started and stopped (`tune`: notes landed).
    rec: oneOf(['start', 'stop']), tune: num,
  },
  // 👋 The welcome (welcome.js, ADR 0028): shown, the level a card set,
  // skipped, ☁️ Open from the cloud tapped.
  welcome: { shown: bool, level: oneOf(['kids', 'regular', 'advanced']), skipped: bool, cloud: bool },
  backup: { saved: bool, loaded: bool, person: bool, into: bool, sounds: num, beats: num, bytes: num, settings: num, already: num, skipped: num, error: text },
  // 🎧 From a song (listen-ui.js): listening started and stopped, what it
  // made (beats, a song), and how it ended: opened as a song or a beat,
  // thrown away or cancelled. Never the song, its name or its sound.
  listen: {
    action: oneOf(['start', 'stop', 'made', 'song', 'beat', 'thrown', 'cancelled']), source: oneOf(['tab', 'screen', 'mic', 'file']),
    seconds: num, parts: num, tempos: num, beats: num, song: bool,
  },
  song: { action: oneOf(['play', 'stop', 'sound', 'keep', 'new', 'tempo']), replaced: bool, slots: num, parts: num, lanes: num, blocks: num, marks: num, seconds: num },
  render: { voice: chain, amount: nums, seconds: num, out: num, ms: num },
  storage: { opened: bool, late: bool, waiting: bool },
  setting: { key: oneOf(Object.keys(SETTING_VALUES)), value: settingValue, was: settingValue },
  person: { added: flag, restored: flag, deleted: flag, bundled: bool, sounds: num, soloStart: bool, adopted: num, newIds: num },
  move: { sounds: num, beats: num, people: num, already: num, skipped: num },   // older sounds brought in (leftover.js)
  // A finger tap that played nothing (tap-watch.js): how far it got, and the page around it.
  tap: {
    screen: oneOf(['pads', 'live', 'kids']), on: oneOf(['pad', 'tile', 'key']), why: oneOf(['unheard', 'no-tap', 'no-sound', 'audio-off']),
    covered: bool, over: text, audio: oneOf(AUDIO_STATES), audioDown: oneOf(AUDIO_STATES), dialogs: num, dialog: text,
    loops: num, fingers: num, upMin: num, shownMin: num, hides: num, n: num,
  },
  cloud: {
    sync: bool, pulled: num, pushed: num, deleted: num, sounds: num, merged: num, clashes: num, kept: num, status: num, error: text,
    put: bool, opened: oneOf([true, 'share', 'left']), removed: bool, pin: oneOf(['set', 'removed']),
    unlocked: bool, remember: bool, forgot: bool, offline: bool, unlinked: num,
    kind: oneOf(['sound', 'beat', 'song']), shared: oneOf(['sound', 'beat', 'song']), remixed: oneOf(['sound', 'beat', 'song']), unshared: bool,
  },
};

// A setting's value is checked against that setting's own list.
function settingValue(v, known, data) {
  const list = SETTING_VALUES[data?.key];
  return list && list.includes(v) ? v : BLANK;
}

function fields(data, rules, known) {
  const out = {};
  if (!data || typeof data !== 'object') return out;
  for (const [key, rule] of Object.entries(rules)) {
    if (!Object.hasOwn(data, key)) continue;
    const value = rule(data[key], known, data);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

// ── Free text ──

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// One pattern for a list of names, longest first so "Rocket Ship" goes
// before "Rocket". Whole words only, any case. Names under two characters are
// left: blanking every "a" would ruin the text and names nobody.
function namePattern(names) {
  const list = [...new Set((names || []).map((n) => String(n ?? '').trim()).filter((n) => n.length >= 2))]
    .sort((a, b) => b.length - a.length);
  if (!list.length) return null;
  // No lookbehind: Safari before 16.4 can't parse one.
  return new RegExp(`(^|[^\\p{L}\\p{N}])(?:${list.map(escape).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
}

const patterns = new WeakMap();  // names array -> its RegExp, so a report builds it once

// Free text as a report may hold it: every known name and every quoted
// phrase blanked, control characters gone, at most TEXT_MAX characters.
export function redact(value, names = []) {
  let s = String(value).replace(/[\u0000-\u001f\u007f]+/g, ' ');
  if (!patterns.has(names)) patterns.set(names, namePattern(names));
  const pattern = patterns.get(names);
  if (pattern) s = s.replace(pattern, (all, before) => `${before}${NAME}`);
  // A quote is most often a name the app was given (a file's, a backup's).
  s = s.replace(/“([^”]{0,80})”|"([^"]{0,80})"/g, (all, a, b) => ((a ?? b) === NAME ? all : all[0] === '"' ? `"${BLANK}"` : `“${BLANK}”`));
  return s.length > TEXT_MAX ? `${s.slice(0, TEXT_MAX - 1)}…` : s;
}

// ── Entries and the whole report ──

// One log entry as a report sends it, or null when its kind has no rule.
// known: {names: [string], kitIds?: Set, origin?: string}
export function cleanEntry(entry, known = {}) {
  const rules = Object.hasOwn(RULES, entry?.kind) ? RULES[entry.kind] : null;
  if (!rules) return null;
  return { t: Math.max(0, Math.round(num(entry.t) ?? 0)), kind: entry.kind, data: fields(entry.data, rules, known) };
}

// The newest ENTRIES_MAX entries, cleaned; `dropped` counts the ones left out.
export function cleanEntries(entries, known = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const out = [];
  let dropped = Math.max(0, list.length - ENTRIES_MAX);
  for (const e of list.slice(-ENTRIES_MAX)) {
    const clean = cleanEntry(e, known);
    if (clean) out.push(clean); else dropped += 1;
  }
  return { entries: out, dropped };
}

export const DEVICE_CODE = /^[0-9A-Z]{4}-[0-9A-Z]{4}$/;
const SESSION = /^s-[a-z0-9]{1,12}$/;
const APP = /^[\w .:+-]{1,40}$/;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,3})?Z$/;
const ZONE = /^[A-Za-z0-9_+\-/]{1,40}$/;

// The whole upload (the plan's § 2 "The payload"), cleaned. Returns null for
// something that is not a report from the app: wrong format or no valid
// device code. The app builds its report through this; the Worker checks
// every upload with it again.
export function cleanPayload(p, known = {}) {
  if (!p || typeof p !== 'object' || p.format !== 1 || !DEVICE_CODE.test(p.device)) return null;
  const env = p.env && typeof p.env === 'object' ? p.env : {};
  const audio = env.audio && typeof env.audio === 'object' ? env.audio : null;
  const screen = Array.isArray(env.screen) ? env.screen.slice(0, 2).map((n) => num(n) ?? null) : null;
  const { entries, dropped } = cleanEntries(p.entries, known);
  // Families from a fixed list. An app from before 2026-10-16 sends the raw
  // `ua`: only its families are kept.
  const fromUa = typeof env.ua === 'string' ? parseAgent(env.ua) : null;
  const family = (key, list) => (list.includes(env[key]) ? env[key] : fromUa ? fromUa[key] : null);
  const settings = fields(p.settings, Object.fromEntries(Object.keys(SETTING_VALUES).map((k) => [k, (v) => (SETTING_VALUES[k].includes(v) ? v : undefined)])), known);
  return {
    format: 1,
    app: typeof p.app === 'string' && APP.test(p.app) ? p.app : 'unknown',
    device: p.device,
    session: typeof p.session === 'string' && SESSION.test(p.session) ? p.session : null,
    sent: typeof p.sent === 'string' && ISO.test(p.sent) ? p.sent : null,
    env: {
      browser: family('browser', BROWSERS),
      os: family('os', SYSTEMS),
      type: family('type', TYPES),
      screen: screen && screen.length === 2 ? screen : null,
      dpr: num(env.dpr) ?? null,
      tz: typeof env.tz === 'string' && ZONE.test(env.tz) ? env.tz : null,
      audio: audio ? {
        sampleRate: num(audio.sampleRate) ?? null,
        baseLatencyMs: num(audio.baseLatencyMs) ?? null,
        state: AUDIO_STATES.includes(audio.state) ? audio.state : null,
      } : null,
    },
    settings,
    counts: fields(p.counts, Object.fromEntries(COUNT_KEYS.map((k) => [k, num])), known),
    dropped: Math.max(0, Math.round(num(p.dropped) ?? 0)) + dropped,
    entries,
  };
}
