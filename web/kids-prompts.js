// 🧸 Kids' spoken prompts: a few recorded words for a kid who can't read yet
// ("Tap a picture!"), one per Kids screen. This file owns which prompts there
// are, the exact words a family member records for each, and which of them
// have a recording yet. Pure: no DOM, no audio (kids-say.js plays them).
//
// A prompt plays only when its file is in web/clips/kids-prompts/<id>.wav, so
// with no recordings the app is as it was. The files are public, like every
// clip. `just kids-prompts` checks the folder; `just kids-prompts --fix`
// then writes RECORDED below, each prompt's `level` (dB, never above 0, as a
// preset's) and web/sw.js's KIDS_PROMPTS, which keep the files for offline.
// Imports nothing, so tools/kids_prompts.py and the tests can read it.

// One prompt a line: tools/kids_prompts.py reads these lines. `tab` is the
// Kids screen it plays on (kids-logic.js KIDS_TABS); `words` is exactly
// what is said, short and in kid words.
export const KIDS_PROMPTS = [
  { id: 'pads', tab: 'pads', words: 'Tap a picture!', level: 0 },
  { id: 'record', tab: 'record', words: 'Tap the mic and talk!', level: 0 },
  { id: 'beats', tab: 'beats', words: 'Tap the squares!', level: 0 },
  { id: 'keys', tab: 'keys', words: 'Tap the keys!', level: 0 },
];

// The prompts that have a recording. Written by `just kids-prompts --fix`.
export const RECORDED = [];

// A recording longer than this is not a prompt (tools/kids_prompts.py).
export const MAX_PROMPT_SECONDS = 2.5;

export const promptFile = (id) => `clips/kids-prompts/${id}.wav`;

// The prompt for a Kids screen, or undefined.
export const promptFor = (tab) => KIDS_PROMPTS.find((p) => p.tab === tab);

// A prompt as audio.js plays a bundled sound. Its id is its own, so it never
// meets a pad's; it has a voice of none, so it plays as recorded.
export const promptClip = (p) => ({
  id: `kids-say-${p.id}`, label: p.words, source: 'bundled', file: promptFile(p.id), voice: 'normal', level: p.level,
});

// The `seen` id (firsts.js) that keeps a prompt to once per person.
export const seenId = (p) => `kids-say-${p.id}`;
