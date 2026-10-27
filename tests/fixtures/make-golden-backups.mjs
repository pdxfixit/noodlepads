// Makes the golden backups, tests/fixtures/backup-1.0.zip and backup-1.1.zip.
// Run once (`node tests/fixtures/make-golden-backups.mjs`); the zips are then
// FIXED. Never regenerate one to make a test pass: a backup somebody saved is
// kept by its owner, and every later copy of the app must keep loading it
// (AGENTS.md "Stored formats are kept by users", ADR 0011).
//
// Each is what a copy of that format wrote: made-up people (Pip, Juno, Toby,
// Wren), tiny sounds, and every store that format had. 1.0 has no groups or
// touch layouts, its beats have no time signature, and its open song is the
// old slots-only shape. 1.1 adds groups, own voices
// and touch layouts, and a song with lanes and a tempo mark.

import { writeFileSync } from 'node:fs';
import { zip } from '../../web/zip.js';

const here = new URL('.', import.meta.url);
const when = new Date(Date.UTC(2026, 9, 11, 12, 0, 0));   // fixed, so the zips never change by being remade

// A tiny mono 8 kHz 16-bit WAV: under half a second of a square wave.
function wav(frames, level) {
  const view = new DataView(new ArrayBuffer(44 + frames * 2));
  const text = (at, s) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) view.setInt16(44 + i * 2, (Math.floor(i / 8) % 2 ? 1 : -1) * level, true);
  return new Uint8Array(view.buffer);
}

const steps = (on) => Array.from({ length: 16 }, (_, i) => on.includes(i));
const row = (clipId, on, extra = {}) => ({ clipId, steps: steps(on), accents: steps([]), rate: 1, ring: false, muted: false, collapsed: false, melody: false, notes: Array(16).fill(null), ...extra });

const people = [
  { id: 'p-pip-1', name: 'Pip', color: '#1F3FA8', added: true, created: 1760000000000, edited: 1760000100000, avatar: '🦊' },
  { id: 'p-juno-2', name: 'Juno', color: '#0C5E4B', added: true, created: 1760000200000, avatar: '🐙' },
  { id: 'p-wren-3', name: 'Wren', color: '#8A2D2D', added: true, created: 1760000300000, avatar: '🐦', hidden: true },
];

// ── 1.0 ──
const files10 = {
  'sounds/user-aa11-1.wav': wav(4000, 9000),
  'sounds/user-aa11-2.wav': wav(3000, 6000),
  'sounds/user-bb22-1.wav': wav(3600, 12000),
};
const doc10 = {
  app: 'noodlepads', format: '1.0', exported: '2026-10-11T12:00:00.000Z', version: '1.0.100',
  people,
  clips: [
    { id: 'user-aa11-1', personId: 'p-pip-1', label: 'Boing', emoji: '🪀', color: 'red', voice: 'chipmunk', amount: 2, mime: 'audio/wav', created: 1760000400000, file: 'sounds/user-aa11-1.wav', trim: { start: 0.05, end: 0.4 } },
    { id: 'user-aa11-2', personId: 'p-pip-1', label: 'Honk', emoji: '📯', voice: 'normal', mime: 'audio/wav', created: 1760000500000, file: 'sounds/user-aa11-2.wav', fx: [{ type: 'voice', voice: 'robot' }, { type: 'voice', voice: 'stadium' }], tweaks: { pitch: -3, echo: 1 }, exact: true },
    { id: 'user-bb22-1', personId: 'p-juno-2', label: 'Zap', emoji: '⚡', color: 'blue', voice: 'normal', mime: 'audio/wav', created: 1760000600000, file: 'sounds/user-bb22-1.wav', root: 60 },
  ],
  overrides: [{ id: 'p-pip-1-airhorn', label: 'Toot', voice: 'monster', amount: 2 }],
  orders: [{ personId: 'p-pip-1', ids: ['user-aa11-1', 'p-pip-1-airhorn', 'user-aa11-2'] }],
  patterns: [{ personId: 'p-pip-1', name: 'Open', bpm: 100, bars: 1, swing: 0, rows: [row('user-aa11-1', [0, 4, 8, 12])] }],
  beats: [
    { id: 'beat-k1-a', personId: 'p-pip-1', name: 'Stomp', bpm: 96, bars: 2, swing: 20, rows: [row('user-aa11-1', [0, 8], { accents: steps([0]) }), row('p-pip-1-laser', [4, 12], { muted: true })], created: 1760000700000, saved: 1760000800000 },
    { id: 'beat-k1-b', personId: 'p-juno-2', name: 'Waltz', bpm: 120, bars: 1, swing: 0, rows: [row('user-bb22-1', [0, 4, 8])], created: 1760000900000, saved: 1760001000000, pinned: 1760001100000 },
  ],
  settings: [{ key: 'djLayout', value: 'qwerty' }, { key: 'sendLogs', value: false }],
  decks: [{ personId: 'p-pip-1', keys: { KeyA: 'user-aa11-1', KeyS: 'p-pip-1-airhorn', KeyD: null } }],
  takes: [{ id: 'take-t1-a', personId: 'p-pip-1', name: 'Jam', created: 1760001200000, duration: 2.5, events: [{ t: 0, clipId: 'user-aa11-1', kind: 'hit' }, { t: 0.5, clipId: 'user-aa11-2', kind: 'loop' }, { t: 2, clipId: 'user-aa11-2', kind: 'stop' }] }],
  // The open song of 1.0: slots only, from before the playlist.
  songs: [{ id: 'song-s1-a', personId: 'p-pip-1', name: 'Ditty', slots: [{ beatId: 'beat-k1-a', times: 2 }, { beatId: 'beat-k1-b', times: 1 }] }],
  songbook: [{ id: 'song-s1-a', personId: 'p-pip-1', name: 'Ditty', slots: [{ beatId: 'beat-k1-a', times: 2 }, { beatId: 'beat-k1-b', times: 1 }], created: 1760001300000, saved: 1760001400000 }],
  prefs: [{ personId: 'p-pip-1', values: { level: 'advanced', timeSignature: '3/4', padSize: 'auto' } }, { personId: 'p-juno-2', values: { level: 'regular' } }],
  layouts: [{ id: 'layout-l1-a', personId: 'p-pip-1', name: 'Drums', created: 1760001500000, keys: { KeyA: 'user-aa11-1', KeyS: null } }],
  voices: [],
};

// ── 1.1 ──
const files11 = { ...files10, 'sounds/user-cc33-1.wav': wav(4400, 7000) };
const doc11 = {
  ...doc10,
  format: '1.1', version: '1.0.200',
  people: [...people, { id: 'p-toby-4', name: 'Toby', color: '#5B2C83', added: true, created: 1760002000000, avatar: '🦖' }],
  clips: [
    { ...doc10.clips[0], group: 'g-drums-1' },
    doc10.clips[1],
    doc10.clips[2],
    { id: 'user-cc33-1', personId: 'p-toby-4', label: 'Roar', emoji: '🦖', voice: 'slow', amount: 6, mime: 'audio/wav', created: 1760002100000, file: 'sounds/user-cc33-1.wav', edits: [{ kind: 'reverse', start: 0.1, end: 0.3 }, { kind: 'gain', start: 0.2, end: 0.4, amount: 2 }], fade: { in: 0.01, out: 0.02 } },
  ],
  orders: [{ personId: 'p-pip-1', ids: ['user-aa11-1', 'p-pip-1-airhorn', 'user-aa11-2'], groups: [{ id: 'g-drums-1', name: 'Drums' }] }],
  // A song with lanes, and a tempo mark.
  songs: [{ id: 'song-s2-a', personId: 'p-pip-1', name: 'Ditty', tempo: 96, tempos: [{ bar: 3, bpm: 110 }],
    lanes: [{ name: 'Drums', emoji: '🥁', muted: false, volume: 1, blocks: [{ beatId: 'beat-k1-a', bar: 0, times: 2 }] }, { name: 'Bass', emoji: '🎸', muted: true, volume: 0.5, blocks: [{ beatId: 'beat-k1-b', bar: 2, times: 1 }] }] }],
  songbook: [{ id: 'song-s2-a', personId: 'p-pip-1', name: 'Ditty', tempo: 96, tempos: [{ bar: 3, bpm: 110 }],
    lanes: [{ name: 'Drums', emoji: '🥁', muted: false, volume: 1, blocks: [{ beatId: 'beat-k1-a', bar: 0, times: 2 }] }, { name: 'Bass', emoji: '🎸', muted: true, volume: 0.5, blocks: [{ beatId: 'beat-k1-b', bar: 2, times: 1 }] }], created: 1760001300000, saved: 1760001400000 }],
  voices: [{ id: 'voice-v1-a', personId: 'p-toby-4', name: 'Deep', emoji: '🐻', knobs: { pitch: -6, echo: 1 }, created: 1760002200000, used: 1760002300000 }],
  touchLayouts: [{ id: 'touch-t1-a', personId: 'p-pip-1', name: 'Bands', created: 1760002400000, bands: [{ group: 'drums', size: 'm', sounds: ['user-aa11-1', 'user-aa11-2'] }] }],
};

for (const [name, doc, files] of [['1.0', doc10, files10], ['1.1', doc11, files11]]) {
  const entries = [{ name: 'backup.json', data: new TextEncoder().encode(JSON.stringify(doc, null, 1)) },
    ...Object.entries(files).map(([n, data]) => ({ name: n, data }))];
  const blob = zip(entries, when);
  writeFileSync(new URL(`backup-${name}.zip`, here), new Uint8Array(await blob.arrayBuffer()));
}
