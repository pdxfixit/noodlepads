// A boards.json for the tests that drive the whole app: the real one's kit
// and palette, plus four made-up people with sounds of their own. The real
// boards.json lists no people (a new device starts with one board, "Me";
// fresh-start.test.mjs checks that), but boards.json may still list people,
// and v2 reads the same format, so the app's handling of them is tested here.
// The names are invented for the tests.

import { readFileSync } from 'node:fs';

const REAL = JSON.parse(readFileSync(new URL('../web/boards.json', import.meta.url), 'utf8'));

const sound = (person, id, label, emoji, color) => ({ id: `${person}-${id}`, label, emoji, color, file: `clips/test/${id}.wav` });

export const TEST_PEOPLE = [
  {
    id: 'pip', name: 'Pip', color: '#1F3FA8',
    clips: [sound('pip', 'name', 'Pip Pads!', '📣', 'yellow'), sound('pip', 'horn', 'Airhorn', '🎺', 'red'),
      sound('pip', 'zapper', 'Laser', '🚀', 'lime'), sound('pip', 'spring', 'Boing', '🐸', 'teal')],
  },
  {
    id: 'juno', name: 'Juno', color: '#0C5E4B',
    clips: [sound('juno', 'name', 'Juno Pads!', '📣', 'white'), sound('juno', 'joke', 'Ba dum tss', '🥁', 'blue'),
      sound('juno', 'roll', 'Drumroll', '🎉', 'orange'), sound('juno', 'zapper', 'Laser', '⚡', 'lime')],
  },
  {
    id: 'toby', name: 'Toby', color: '#9E1640',
    clips: [sound('toby', 'name', 'Toby Pads!', '📣', 'yellow'), sound('toby', 'fanfare', 'Ta-da!', '🎉', 'pink'),
      sound('toby', 'whistle', 'Slide whistle', '🚀', 'teal'), sound('toby', 'spring', 'Boing', '🐸', 'lime')],
  },
  {
    id: 'wren', name: 'Wren', color: '#4C2A8C',
    clips: [sound('wren', 'name', 'Wren Pads!', '📣', 'white'), sound('wren', 'womp', 'Sad trombone', '🎺', 'blue'),
      sound('wren', 'joke', 'Ba dum tss', '🥁', 'orange'), sound('wren', 'horn', 'Airhorn', '💥', 'red')],
  },
];

// A fresh copy each time, so a test that changes it changes only its own.
export const testManifest = () => structuredClone({ ...REAL, people: TEST_PEOPLE });
