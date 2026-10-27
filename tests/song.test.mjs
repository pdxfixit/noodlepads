import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSong, beatSteps, planSong, linkSong, uniqueSongName, SONG_ID } from '../web/song.js';
import { cleanPattern, planHits } from '../web/beat.js';
import { START_LANES } from '../web/playlist.js';

const A = 'beat-a';
const B = 'beat-b';

test('a stored song is cleaned: a name, a tempo, lanes, and the slots older copies read', () => {
  const song = cleanSong({
    personId: 'juno',
    name: '  Funky Anthem  ',
    tempo: 300,
    lanes: [{ name: 'Boom', emoji: '💥', blocks: [{ beatId: A, bar: 4, times: 2 }, { beatId: '../evil', bar: 0 }] }, { blocks: [{ beatId: B, bar: 0, times: 1 }] }],
    extra: 'dropped',
  });
  assert.deepEqual(song, {
    personId: 'juno',
    name: 'Funky Anthem',
    tempo: 180,
    lanes: [
      { name: 'Boom', emoji: '💥', muted: false, volume: 1, blocks: [{ beatId: A, bar: 4, times: 2 }] },
      { name: 'Bass', emoji: '🎸', muted: false, volume: 1, blocks: [{ beatId: B, bar: 0, times: 1 }] },
    ],
    slots: [{ beatId: B, times: 1 }, { beatId: A, times: 2 }],
  });
  assert.equal(cleanSong({ personId: 'juno' }, () => 'Wobbly Ditty').name, 'Wobbly Ditty', 'a new song gets a fun name up front');
  assert.equal(cleanSong({ personId: 'juno', lanes: [] }).lanes.length, START_LANES, 'a new song has four lanes');
  assert.equal(cleanSong({ slots: [] }), null, 'a song belongs to someone');
  assert.equal(cleanSong(null), null);
});

test('a song from before the playlist converts: its slots in order on lane 1, the tempo of its first beat', () => {
  const beats = { [A]: { id: A, bpm: 132, bars: 2, rows: [] }, [B]: { id: B, bpm: 90, bars: 1, signature: '3/4', rows: [] } };
  const old = cleanSong({ id: 'song-old-1', personId: 'juno', name: 'Old', slots: [{ beatId: A, times: 2 }, { beatId: B, times: 4 }, { beatId: A, times: 1 }] }, undefined, (id) => beats[id]);
  assert.equal(old.tempo, 132);
  assert.deepEqual(old.lanes[0].blocks, [{ beatId: A, bar: 0, times: 2 }, { beatId: B, bar: 4, times: 4 }, { beatId: A, bar: 7, times: 1 }]);
  assert.ok(old.lanes.slice(1).every((l) => !l.blocks.length));
  assert.deepEqual(old.slots, [{ beatId: A, times: 2 }, { beatId: B, times: 4 }, { beatId: A, times: 1 }], 'older copies still see the same slots');
  // With its beats unknown (gone), a bar a pass and the usual tempo.
  const bare = cleanSong({ personId: 'juno', slots: [{ beatId: A, times: 2 }, { beatId: B, times: 1 }] });
  assert.deepEqual(bare.lanes[0].blocks, [{ beatId: A, bar: 0, times: 2 }, { beatId: B, bar: 2, times: 1 }]);
  assert.equal(bare.tempo, 100);
  // Read again, a converted song is the same song.
  assert.deepEqual(cleanSong(old, undefined, (id) => beats[id]), old);
});

test("a beat's pass in pills: its bar times its bars", () => {
  assert.equal(beatSteps({ bars: 2 }), 32);
  assert.equal(beatSteps({ bars: 1, signature: '5/4' }), 20);
  assert.equal(beatSteps({ bars: 4, signature: '6/8' }), 48);
  assert.equal(beatSteps(undefined), null);
});

// A beat saved before beats had their own signature is stamped with the one it
// was read in as it is stored or comes in (old-beats.js), so a beat with none
// here is a new one: 4/4, whatever the old Settings say. Nothing guesses.
test('a beat with no signature is 4/4 in a song, whatever the old Settings say', async () => {
  const { state } = await import('../web/state.js');
  state.settings.set('advancedBeats', true);
  state.settings.set('timeSignature', '3/4');
  try {
    assert.equal(beatSteps({ bars: 2 }), 32, 'Advanced on with an old 3/4: still 4/4');
    assert.equal(beatSteps({ bars: 1, signature: '5/4' }), 20, 'a beat with its own keeps it');
  } finally {
    state.settings.delete('advancedBeats');
    state.settings.delete('timeSignature');
  }
});

test('planned at the song tempo: every beat plays as fast as the song, whatever its own tempo', () => {
  // A at 60 BPM and B at 180 BPM, both one bar with a hit on every beat; the song is at 120.
  const beats = {
    [A]: { id: A, personId: 'juno', bpm: 60, bars: 1, rows: [{ clipId: 'kick', steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] }] },
    [B]: { id: B, personId: 'juno', bpm: 180, bars: 1, rows: [{ clipId: 'clap', steps: [1] }] },
  };
  const seq = {
    beatPlan: (raw) => {
      const p = cleanPattern(raw, raw.personId);
      const seconds = 16 * (60 / p.bpm / 4);
      return { pattern: p, seconds, hits: planHits(p, 'plain', seconds, 16) };
    },
  };
  const song = cleanSong({ personId: 'juno', tempo: 120, lanes: [{ blocks: [{ beatId: A, bar: 0, times: 2 }] }, { muted: true, blocks: [{ beatId: B, bar: 1, times: 1 }] }] });
  const planned = planSong(song, (id) => beats[id], seq);
  assert.equal(planned.seconds, 4);
  assert.deepEqual(planned.events.map((e) => [e.lane, e.time]), [[0, 0], [0, 0.5], [0, 1], [0, 1.5], [0, 2], [1, 2], [0, 2.5], [0, 3], [0, 3.5]]);
  assert.equal(planned.plans.get(A).pattern.bpm, 120, "the beat's own tempo is left on Beats");
  const rendered = planSong(song, (id) => beats[id], seq, { skipMuted: true });
  assert.ok(rendered.events.every((e) => e.lane === 0), 'Save as a sound leaves a muted lane out');
  const later = planSong(song, (id) => beats[id], seq, { from: 2 });
  assert.equal(later.events[0].time, 0, 'from bar 2');
  assert.equal(later.events.length, 5);
});

test('songs are a list: a song keeps a safe id; one from before the list gets one, joining a saved song of its name', () => {
  assert.equal(cleanSong({ id: 'song-abc-1', personId: 'juno', name: 'Ditty', slots: [] }).id, 'song-abc-1');
  assert.equal(cleanSong({ id: '../evil', personId: 'juno', name: 'Ditty' }).id, undefined);
  // A version 8 record (one song per person, no id) becomes the open song with a new id.
  const old = cleanSong({ personId: 'juno', name: 'Funky Anthem', slots: [{ beatId: A, times: 2 }] });
  const linked = linkSong(old, [], () => 'song-new-1');
  assert.equal(linked.id, 'song-new-1');
  assert.deepEqual(linked.lanes[0].blocks, [{ beatId: A, bar: 0, times: 2 }]);
  assert.equal(linkSong(old, [{ id: 'song-kept-1', name: 'funky anthem' }]).id, 'song-kept-1', 'already in the list (a backup loaded twice)');
  assert.equal(linkSong(linked, []), linked, 'a song with an id is left alone');
  assert.match(linkSong(old, []).id, SONG_ID);
  assert.equal(uniqueSongName('Ditty', [{ id: 'song-a', name: 'Ditty' }]), 'Ditty 2');
  assert.equal(uniqueSongName('Ditty', [{ id: 'song-a', name: 'Ditty' }], 'song-a'), 'Ditty', 'renaming to its own name');
});
