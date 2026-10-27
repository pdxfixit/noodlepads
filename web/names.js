// Made-up default names, so a new beat, sound or person starts out with
// something fun instead of "Beat 3" or "New person". Pure: no DOM, no
// storage. Every function takes the names already in use and never repeats
// one, and every name fits the field it goes in (sound labels and beat names
// 24 characters, person names 16).

// Every name a kid gives or a clean keeps (sounds, beats, songs, takes, groups,
// layouts, voices, shares): at most this many characters, counted by
// `nameLength` and cut by `cutName`.
export const MAX_NAME = 24;
export const MAX_PERSON = 20;   // "Captain Cranberries" (19), a person's fun name

// A name cut to at most `max` characters, the one way every name and label
// is cut (sounds, beats, songs, takes, groups, layouts, voices, people,
// lanes, shares; the Worker's too). Characters are code points, so
// `[...name].length`, never UTF-16 units, and the cut is never inside one:
// an emoji in the last place stays whole or goes whole, and one built of
// several (👍🏽, 👨‍👩‍👧) is never left in pieces. Before, most cuts were
// `.slice(0, 24)`, which could leave half an emoji; half of one an old cut
// left (a lone surrogate) is dropped, so the next clean mends the name.
// Bounded for untrusted input (a backup, a share title at the Worker): only
// a prefix of a few times `max` is ever looked at, and segmenting stops at
// the cut, so a name of megabytes costs no more than a short one.
const GRAPHEMES = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter() : null;
const LOOK = 8;   // times `max`: code units looked at, far past any real name's
// Half a surrogate pair on its own: a string spread by code points gives it
// as one unit. (No lookbehind regex: Safari before 16.4 can't parse one.)
const lone = (ch) => ch.length === 1 && ch >= '\uD800' && ch <= '\uDFFF';
export const nameLength = (text) => [...String(text ?? '')].length;
export function cutName(text, max = MAX_NAME) {
  let s = String(text ?? '');
  if (s.length > max * LOOK) s = s.slice(0, max * LOOK);
  if (/[\uD800-\uDFFF]/.test(s)) s = [...s].filter((ch) => !lone(ch)).join('');
  if (s.length <= max) return s;   // no more units than `max`: no more characters either
  let out = '';
  let n = 0;
  for (const g of GRAPHEMES ? GRAPHEMES.segment(s) : s) {
    const part = GRAPHEMES ? g.segment : g;
    n += nameLength(part);
    if (n > max) break;
    out += part;
  }
  return out;
}

// A name no other in `taken` has, ignoring case: "Ditty", then "Ditty 2",
// "Ditty 3"…, the base cut so the number fits `max`.
export function numbered(name, taken, max = MAX_NAME) {
  const used = new Set([...taken].map((n) => String(n).toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const tail = ` ${n}`;
    const candidate = cutName(name, max - tail.length) + tail;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

// Short words, so that the longest adjective and the longest noun still fit
// together in 24 characters (names.test.mjs checks that).
export const ADJECTIVES = [
  'Wobbly', 'Sneaky', 'Turbo', 'Fuzzy', 'Squeaky', 'Bouncy', 'Sparkly', 'Grumpy', 'Giggly', 'Zippy',
  'Cosmic', 'Soggy', 'Mighty', 'Tiny', 'Giant', 'Spicy', 'Funky', 'Jolly', 'Wiggly', 'Crunchy',
  'Dizzy', 'Sleepy', 'Rowdy', 'Silly', 'Super', 'Mega', 'Captain', 'Secret', 'Electric', 'Frosty',
  'Lucky', 'Bubbly', 'Dancing', 'Flying', 'Ninja', 'Royal', 'Rusty', 'Shiny', 'Stormy', 'Sunny',
  'Wacky', 'Zany', 'Cheeky', 'Fluffy', 'Gooey', 'Hyper', 'Jumbo', 'Loopy', 'Nutty', 'Plucky',
];

export const BEAT_NOUNS = [
  'Thunder', 'Pancake', 'Noodle', 'Waffle', 'Meteor', 'Pickle', 'Rocket', 'Marshmallow', 'Dino', 'Jellybean',
  'Taco', 'Walrus', 'Llama', 'Volcano', 'Burrito', 'Banana', 'Robot', 'Penguin', 'Sandwich', 'Tornado',
  'Pretzel', 'Moose', 'Cupcake', 'Dragon', 'Biscuit', 'Squid', 'Popcorn', 'Yeti', 'Lasagna', 'Comet',
  'Cheeseball', 'Donut', 'Gizmo', 'Hamster', 'Jamboree', 'Kazoo', 'Muffin', 'Octopus', 'Parade', 'Stampede',
];

export const SOUND_NOUNS = [
  'Honk', 'Boing', 'Zap', 'Whoosh', 'Blip', 'Squeak', 'Kazoo', 'Burp', 'Splat', 'Zoink',
  'Bonk', 'Ding', 'Fizz', 'Pop', 'Twang', 'Wobble', 'Giggle', 'Rumble', 'Toot', 'Clank',
  'Sproing', 'Beep', 'Boop', 'Whistle', 'Plink', 'Thump', 'Zing', 'Crash', 'Yodel', 'Bloop',
  'Ribbit', 'Roar', 'Trumpet', 'Buzz', 'Snort', 'Chirp', 'Gong', 'Splash', 'Jingle', 'Kapow',
];

// Whole names for people. These are made-up characters, never real names.
// DJ mode takes (performances).
export const TAKE_NOUNS = [
  'Jam', 'Hoedown', 'Shindig', 'Boogie', 'Ruckus', 'Rumpus', 'Fiesta', 'Showdown', 'Encore', 'Remix',
  'Mixtape', 'Stomp', 'Romp', 'Groove', 'Shuffle', 'Rampage', 'Session', 'Hullabaloo', 'Freestyle', 'Wiggle',
  'Breakdown', 'Jamboree', 'Bonanza', 'Uproar', 'Hootenanny', 'Kerfuffle', 'Medley', 'Riot', 'Bop', 'Jive',
  'Rodeo', 'Carnival', 'Kaboodle', 'Blowout', 'Throwdown', 'Dance-off', 'Spectacle', 'Extravaganza', 'Mashup', 'Bash',
];

// Songs (Song mode): a chain of beats.
export const SONG_NOUNS = [
  'Anthem', 'Ballad', 'Ditty', 'Tune', 'Serenade', 'Shanty', 'Lullaby', 'Opera', 'Symphony', 'Chorus',
  'Banger', 'Singalong', 'Earworm', 'Jingle', 'Medley', 'Overture', 'Rhapsody', 'Hit', 'Song', 'Yodel',
];

export const PERSON_NAMES = [
  'Mystery Guest', 'Captain Nobody', 'Agent Zigzag', 'Sir Squeaks', 'Dr. Doodle', 'Professor Pop',
  'Count Giggles', 'Lady Wobble', 'Mx. Mystery', 'Super Someone', 'Admiral Fluff', 'Baron Bounce',
  'Chef Chaos', 'DJ Pickle', 'Major Mayhem', 'Queen Kazoo', 'Sergeant Snax', 'The Visitor',
  'Wizard Fizz', 'Nobody Special', 'Pirate Pancake', 'Sir Reginald', 'Ninja Noodle', 'Madame Boing',
  'Boss Biscuit', 'Duke Dino', 'Earl Echo', 'Granny Gizmo', 'Rocket Rae', 'Sunny Stranger',
];

const key = (name) => name.trim().toLowerCase();

// A name from `all` (the candidates) that is not in `taken`, fits `max`, and
// is chosen by `random()` (Math.random unless a test passes its own). If
// every candidate is used, a number is added to a random one ("Wobbly Kazoo 2").
function pick(all, taken, max, random) {
  const used = new Set([...taken].map(key));
  const free = all.filter((n) => n.length <= max && !used.has(key(n)));
  if (free.length) return free[Math.floor(random() * free.length) % free.length];
  const base = all.filter((n) => n.length <= max - 3);
  const seed = base[Math.floor(random() * base.length) % base.length];
  for (let n = 2; ; n++) {
    const name = `${seed} ${n}`;
    if (!used.has(key(name))) return name;
  }
}

const combos = (nouns, max) => ADJECTIVES.flatMap((a) => nouns.map((n) => `${a} ${n}`)).filter((n) => n.length <= max);

// The combinations are built once; there are over a thousand of each.
const BEAT_NAMES = combos(BEAT_NOUNS, MAX_NAME);
const SOUND_NAMES = combos(SOUND_NOUNS, MAX_NAME);
const TAKE_NAMES = combos(TAKE_NOUNS, MAX_NAME);
const SONG_NAMES = combos(SONG_NOUNS, MAX_NAME);

// `taken`: the names already used (this person's saved beats, say).
export const beatName = (taken = [], random = Math.random) => pick(BEAT_NAMES, taken, MAX_NAME, random);
export const soundName = (taken = [], random = Math.random) => pick(SOUND_NAMES, taken, MAX_NAME, random);
export const takeName = (taken = [], random = Math.random) => pick(TAKE_NAMES, taken, MAX_NAME, random);
export const songName = (taken = [], random = Math.random) => pick(SONG_NAMES, taken, MAX_NAME, random);
// 🎧 From a song's beats (docs/design/beat-from-a-song.md): one fun name
// for the whole song, each part's beat that name and its letter, "Zippy
// Noodle · A". `letters` are the parts' ids; the name chosen is one whose
// every lettered name nobody has and fits MAX_NAME. → { base, names }, the
// names in `letters` order. With every name taken, a number joins the base.
export function partNames(letters, taken = [], random = Math.random) {
  const used = new Set([...taken].map(key));
  const tail = (l) => ` · ${l}`;
  const room = MAX_NAME - Math.max(1, ...letters.map((l) => tail(l).length));
  const free = (base) => base.length <= room && letters.every((l) => !used.has(key(base + tail(l))));
  const open = BEAT_NAMES.filter(free);
  let base = open.length ? open[Math.floor(random() * open.length) % open.length] : null;
  if (!base) {
    const short = BEAT_NAMES.filter((n) => n.length <= room - 3);
    const seed = short[Math.floor(random() * short.length) % short.length];
    for (let n = 2; !base; n++) if (free(`${seed} ${n}`)) base = `${seed} ${n}`;
  }
  return { base, names: letters.map((l) => base + tail(l)) };
}

// A scratch beat kept with 💾 Keep (ADR 0020) after it came from a groove:
// a fun name and the groove, "Sleepy Squid (Ska version)". Beat names hold
// MAX_NAME characters and most grooves' names are long, so the first of
// these that fits and nobody has: a beat's fun name and "(<groove>
// version)"; its noun alone, "Squid (House version)"; the fun name and
// "(<groove>)"; "<groove> version"; then the groove's own name, numbered
// if taken ("Four on the floor 2").
export function keptName(groove, taken = [], random = Math.random) {
  const used = new Set([...taken].map(key));
  const g = cutName(String(groove ?? '').trim());
  if (!g) return beatName(taken, random);
  const tiers = [
    BEAT_NAMES.map((n) => `${n} (${g} version)`),
    BEAT_NOUNS.map((n) => `${n} (${g} version)`),
    BEAT_NAMES.map((n) => `${n} (${g})`),
    [`${g} version`],
  ];
  for (const tier of tiers) {
    const free = tier.filter((n) => nameLength(n) <= MAX_NAME && !used.has(key(n)));
    if (free.length) return free[Math.floor(random() * free.length) % free.length];
  }
  if (!used.has(key(g))) return g;
  for (let n = 2; ; n++) {
    const tail = ` ${n}`;
    const name = cutName(g, MAX_NAME - tail.length) + tail;
    if (!used.has(key(name))) return name;
  }
}

// A beat saved as a sound is a remix: "<beat> (<emoji> <silly word> Remix)".
// Labels hold MAX_NAME characters, so a long beat name keeps only its last
// word, and if even that won't fit, the remix stands alone.
export const REMIX_WORDS = [
  'Wonky', 'Turbo', 'Funky', 'Sneaky', 'Bouncy', 'Spicy', 'Mega', 'Noodle', 'Disco', 'Cosmic',
  'Squeaky', 'Jiggly', 'Zesty', 'Goofy', 'Snazzy', 'Crispy', 'Fuzzy', 'Groovy', 'Loopy', 'Bonkers',
];
export const REMIX_EMOJI = ['🌀', '✨', '🔥', '🍕', '🦄', '🐸', '🚀', '🎉', '🍩', '🌈', '👽', '🐙', '🦖', '🍉', '💥', '🎈'];
export function remixName(beat, taken = [], random = Math.random) {
  const used = new Set(taken.map(key));
  const words = String(beat || '').trim().split(/\s+/).filter(Boolean);
  const bases = [words.join(' '), words.at(-1), ''].filter((b, i, all) => b != null && all.indexOf(b) === i);
  const tries = REMIX_WORDS.flatMap((w) => REMIX_EMOJI.map((e) => `${e} ${w} Remix`));
  const start = Math.floor(random() * tries.length);
  for (const base of bases) {
    for (let i = 0; i < tries.length; i++) {
      const remix = tries[(start + i) % tries.length];
      const name = base ? `${base} (${remix})` : remix;
      if (nameLength(name) <= MAX_NAME && !used.has(key(name))) return name;
    }
  }
  return soundName(taken, random);
}

// A sound made with ✨ Make one: an adjective and a word for what it is
// ("Cosmic Zapper" for a Laser, "Mighty Kaboom" for a Boom). `kind` is the
// starter's id; anything else (🎲, or slid away from its starter) is a gadget.
export const SYNTH_NOUNS = {
  laser: ['Zapper', 'Blaster', 'Pew', 'Laser', 'Ray', 'Zap'],
  boom: ['Kaboom', 'Boom', 'Thud', 'Rumble', 'Thump', 'Ka-Blam'],
  tss: ['Tss', 'Hiss', 'Sizzle', 'Fizz', 'Tsst', 'Shh'],
  clap: ['Clap', 'Smack', 'Slap', 'Snap', 'Clapper', 'High Five'],
  siren: ['Siren', 'Wail', 'Alarm', 'Woo-Woo', 'Nee-Naw', 'Howler'],
  coin: ['Coin', 'Bling', 'Ding', 'Jackpot', 'Ka-Ching', 'Loot'],
  wind: ['Breeze', 'Gust', 'Whoosh', 'Wind', 'Draft', 'Blizzard'],
  other: ['Gizmo', 'Doodad', 'Contraption', 'Widget', 'Thingamajig', 'Noise'],
};
const SYNTH_NAMES = Object.fromEntries(Object.entries(SYNTH_NOUNS).map(([k, nouns]) => [k, combos(nouns, MAX_NAME)]));
export const synthName = (kind, taken = [], random = Math.random) => pick(SYNTH_NAMES[kind] ?? SYNTH_NAMES.other, taken, MAX_NAME, random);

// Two sounds mixed into one: a blend, the start of one and the end of the
// other ("Burp" and "Honk" make "Burponk", or "Honkurp"). Each label's last
// word is used, so "Wobbly Kazoo" blends as "Kazoo". A blend under 3 letters,
// over 24, or already taken falls back to soundName.
export function mixName(a, b, taken = [], random = Math.random) {
  const used = new Set(taken.map(key));
  const last = (s) => String(s || '').trim().split(/\s+/).at(-1) || '';
  const tail = (w) => { const i = w.slice(1).search(/[aeiouy]/i); return (i < 0 ? w : w.slice(i + 1)).toLowerCase(); };
  const blend = (x, y) => { const w = last(x) + tail(last(y)); return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''; };
  const tries = random() < 0.5 ? [blend(a, b), blend(b, a)] : [blend(b, a), blend(a, b)];
  return tries.find((n) => nameLength(n) >= 3 && nameLength(n) <= MAX_NAME && !used.has(key(n)))
    ?? soundName(taken, random);
}

export const personName = (taken = [], random = Math.random) => pick(PERSON_NAMES, taken, MAX_PERSON, random);

// ── Fun names for people (profiles) ──
// Nobody types a person's name (Ben, 2026-10-11): the cloud's list is public,
// so every person, the first one on a new device included, gets a made-up
// name in one of two styles (Ben's examples): an adjective and an animal
// ("Friendly Sloth"), or a title and a food or thing starting with the same
// letter ("Captain Cranberries"). The Worker accepts only names this can
// make (isFunName), so a typed name can never reach the list. Words are
// everyday things; pairs that make a known character or brand are left out
// (FUN_AVOID).
export const FUN_TITLES = [
  'Admiral', 'Agent', 'Baron', 'Boss', 'Captain', 'Chef', 'Chief', 'Colonel', 'Commodore', 'Count',
  'Countess', 'Deputy', 'Doctor', 'Duchess', 'Duke', 'General', 'King', 'Lady', 'Lord', 'Madame',
  'Major', 'Mayor', 'Pilot', 'Prince', 'Princess', 'Professor', 'Queen', 'Ranger', 'Sergeant', 'Sheriff',
  'Sir', 'Skipper', 'Tycoon', 'Warden', 'Wizard',
];
export const FUN_NOUNS = [
  'Acorn', 'Alpaca', 'Anchovy', 'Apricot', 'Armadillo', 'Avocado', 'Badger', 'Bagel', 'Banana', 'Biscuit',
  'Blueberry', 'Broccoli', 'Brownie', 'Bumblebee', 'Burrito', 'Cabbage', 'Cactus', 'Cheddar', 'Chipmunk', 'Coconut',
  'Cookie', 'Cranberries', 'Cranberry', 'Crumpet', 'Cucumber', 'Cupcake', 'Daffodil', 'Dingo', 'Doodle', 'Doughnut', 'Dumpling',
  'Gherkin', 'Giraffe', 'Gizmo', 'Gopher', 'Goulash', 'Gumdrop', 'Kazoo', 'Ketchup', 'Kiwi', 'Koala',
  'Kumquat', 'Lemon', 'Lentil', 'Llama', 'Lobster', 'Lollipop', 'Macaroni', 'Mango', 'Meatball', 'Moose',
  'Muffin', 'Pancake', 'Parsnip', 'Peanut', 'Penguin', 'Pickle', 'Platypus', 'Pretzel', 'Pudding', 'Quail',
  'Quince', 'Radish', 'Raccoon', 'Raisin', 'Ravioli', 'Rhubarb', 'Sardine', 'Sausage', 'Sprinkles', 'Squash',
  'Squid', 'Sushi', 'Taco', 'Tadpole', 'Toaster', 'Turnip', 'Waffle', 'Walnut', 'Walrus', 'Wombat',
];
export const FUN_ADJECTIVES = [
  'Bouncy', 'Brave', 'Breezy', 'Bubbly', 'Cheerful', 'Cheeky', 'Chunky', 'Clever', 'Cosmic', 'Cozy',
  'Curious', 'Dancing', 'Dizzy', 'Fancy', 'Fluffy', 'Friendly', 'Funky', 'Fuzzy', 'Gentle', 'Giggly',
  'Groovy', 'Happy', 'Jolly', 'Jumpy', 'Lucky', 'Mighty', 'Nifty', 'Peppy', 'Plucky', 'Silly',
  'Sleepy', 'Snappy', 'Sneaky', 'Sparkly', 'Speedy', 'Sunny', 'Wiggly', 'Wobbly', 'Zesty', 'Zippy',
];
export const FUN_ANIMALS = [
  'Badger', 'Beaver', 'Bunny', 'Dolphin', 'Duckling', 'Ferret', 'Flamingo', 'Fox', 'Frog', 'Gecko',
  'Giraffe', 'Hamster', 'Hedgehog', 'Kitten', 'Koala', 'Lemur', 'Llama', 'Lobster', 'Moose', 'Narwhal',
  'Octopus', 'Otter', 'Owl', 'Panda', 'Parrot', 'Penguin', 'Platypus', 'Puffin', 'Raccoon', 'Seal',
  'Sloth', 'Squid', 'Tiger', 'Toucan', 'Turtle', 'Walrus', 'Wombat', 'Yak', 'Zebra', 'Pony',
];
// Pairs that name someone else's character; never made.
export const FUN_AVOID = new Set(['Doctor Doodle', 'Speedy Gonzales', 'Lucky Duck', 'Happy Feet', 'Mighty Moose']);

const fits = (name) => name.length <= MAX_PERSON && !FUN_AVOID.has(name);
// "Captain Cranberries": a title and a word with its first letter.
export const TITLE_NAMES = FUN_TITLES.flatMap((t) => FUN_NOUNS.filter((n) => n[0] === t[0]).map((n) => `${t} ${n}`)).filter(fits);
// "Friendly Sloth": an adjective and an animal.
export const ANIMAL_NAMES = FUN_ADJECTIVES.flatMap((a) => FUN_ANIMALS.map((n) => `${a} ${n}`)).filter(fits);
export const FUN_NAMES = [...TITLE_NAMES, ...ANIMAL_NAMES];

// A fun name nobody in `taken` has, each style as likely as the other; with
// every one taken, a number is added ("Friendly Sloth 2"), which isFunName
// also accepts.
export function funName(taken = [], random = Math.random) {
  const used = new Set([...taken].map(key));
  const styles = random() < 0.5 ? [TITLE_NAMES, ANIMAL_NAMES] : [ANIMAL_NAMES, TITLE_NAMES];
  const style = styles.find((list) => list.some((n) => !used.has(key(n)))) ?? FUN_NAMES;
  return pick(style, taken, MAX_PERSON, random);
}

// Special names (Ben, 2026-10-11): whole names a person can be given only by
// choosing one in 🎲's "Pick a name" list (people.js). funName never hands
// them out at random. isFunName accepts them, so they sync, survive backups
// and pass the Worker's check like any made-up name. Each fits MAX_PERSON.
export const SPECIAL_NAMES = ['Salacious Crumb'];
const OK_SET = new Set([...FUN_NAMES, ...SPECIAL_NAMES]);

// Whether `name` is one funName can make (a listed pair, or one with
// " 2"…" 99"), or a special name.
export function isFunName(name) {
  if (typeof name !== 'string') return false;
  if (OK_SET.has(name)) return true;
  const m = /^(.+) ([2-9]|[1-9][0-9])$/.exec(name);
  return !!m && OK_SET.has(m[1]);
}

// The "Pick a name" list: `n` fresh made-up names nobody in `taken` has (no
// repeats among them), then the special names nobody has yet.
export function nameChoices(taken = [], n = 12, random = Math.random) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(funName([...taken, ...out], random));
  const used = new Set([...taken].map(key));
  return [...out, ...SPECIAL_NAMES.filter((s) => !used.has(key(s)))];
}

// A remix of something shared (🎛️ Remix): its title and " remix", cut so the
// whole still fits a label ("Wobbly Marshmallow remix" is 24).
export function sharedRemixName(title) {
  const base = cutName(String(title ?? '').trim(), MAX_NAME - 6).trim() || 'Shared';
  return `${base} remix`;
}

// A piece chopped from a sound is family of it: "Baby Burp", "Burp Jr.",
// "Mini Burp". It still says where it came from, which is the point of
// sampling. A long parent name keeps only its last word ("Wobbly Kazoo" →
// "Baby Kazoo"); if nothing fits, a plain made-up name.
export const CHOP_NAMES = [
  'Baby {}', '{} Jr.', 'Mini {}', 'Teeny {}', '{} Crumb', 'Little {}', 'Wee {}', '{} Bit',
  'Itty {}', '{} Nugget', 'Micro {}', '{} Sprout', 'Pocket {}', '{} Junior', 'Lil {}', '{} Speck',
];
export function chopName(parent, taken = [], random = Math.random) {
  const used = new Set(taken.map(key));
  const words = String(parent || '').trim().split(/\s+/).filter(Boolean);
  const bases = [words.join(' '), words.at(-1)].filter((b, i, all) => b && all.indexOf(b) === i);
  const start = Math.floor(random() * CHOP_NAMES.length);
  for (const base of bases) {
    for (let i = 0; i < CHOP_NAMES.length; i++) {
      const name = CHOP_NAMES[(start + i) % CHOP_NAMES.length].replace('{}', base);
      if (nameLength(name) <= MAX_NAME && !used.has(key(name))) return name;
    }
  }
  return soundName(taken, random);
}
