// Groups of a kid's own sounds (web/groups.js, ADR 0013): the pure logic,
// and that a backup, a merge and the cloud's share bundle carry them right.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanGroups, groupOwn, pruneGroups, moveGroup, joinGroups, newGroupId, groupName, groupIdOf, MAX_GROUP_NAME, UNGROUPED, UNGROUPED_NAME,
} from '../web/groups.js';
import { makeBackup, readBackup } from '../web/backup.js';
import { mergeLoaded } from '../web/merge.js';
import { shareBundle, shareDoc } from '../web/cloud-sync.js';
import { withBulkChanges } from '../web/model.js';
import { bytes } from './helpers.mjs';

const clip = (id, group, over = {}) => ({ id, personId: 'pip', label: id, group, ...over });

test('cleanGroups keeps each real group once, with a name; junk goes', () => {
  assert.equal(cleanGroups(undefined), null);
  assert.equal(cleanGroups([]), null);
  assert.deepEqual(cleanGroups([
    { id: 'g-a', name: '  Drums  ' }, { id: 'g-a', name: 'Again' }, { id: 'nope', name: 'x' }, { id: 'g-b', name: '   ' },
    { id: 'g-c', name: 'L'.repeat(60), extra: 1 }, null, 'g-d',
  ]), [{ id: 'g-a', name: 'Drums' }, { id: 'g-c', name: 'L'.repeat(MAX_GROUP_NAME) }]);
  assert.equal(groupName('  Silly voices '), 'Silly voices');
  assert.equal(groupIdOf('g-x1'), 'g-x1');
  assert.equal(groupIdOf('drums'), undefined, 'a kit group is no own group');
});

test('groupOwn puts sounds under their groups in the kid\'s order, then Not in a group; an empty group is left out', () => {
  const clips = [clip('a', 'g-2'), clip('b'), clip('c', 'g-1'), clip('d', 'g-gone'), clip('e', 'g-2')];
  const groups = [{ id: 'g-1', name: 'One' }, { id: 'g-2', name: 'Two' }, { id: 'g-3', name: 'Empty' }];
  const out = groupOwn(clips, groups);
  assert.deepEqual(out.map((g) => [g.id, g.name, g.clips.map((c) => c.id)]), [
    ['g-1', 'One', ['c']], ['g-2', 'Two', ['a', 'e']], [UNGROUPED, UNGROUPED_NAME, ['b', 'd']],
  ]);
  assert.deepEqual(groupOwn([clip('a', 'g-1')], groups).map((g) => g.id), ['g-1'], 'no Not in a group when every sound has one');
  assert.deepEqual(pruneGroups(groups, clips).map((g) => g.id), ['g-1', 'g-2']);
});

test('moveGroup, joinGroups and newGroupId', () => {
  const groups = [{ id: 'g-1', name: 'One' }, { id: 'g-2', name: 'Two' }, { id: 'g-3', name: 'Three' }];
  assert.deepEqual(moveGroup(groups, 'g-2', -1).map((g) => g.id), ['g-2', 'g-1', 'g-3']);
  assert.deepEqual(moveGroup(groups, 'g-3', 1).map((g) => g.id), ['g-1', 'g-2', 'g-3'], 'the end stays the end');
  assert.deepEqual(joinGroups([{ id: 'g-1', name: 'Mine' }], [{ id: 'g-1', name: 'Theirs' }, { id: 'g-9', name: 'New' }]),
    [{ id: 'g-1', name: 'Mine' }, { id: 'g-9', name: 'New' }]);
  const id = newGroupId(['g-1']);
  assert.ok(groupIdOf(id), id);
  let calls = 0;
  const fixed = () => (++calls < 3 ? 0.5 : 0.25);
  const taken = newGroupId([], () => 0.5);
  assert.notEqual(newGroupId([taken], fixed), taken, 'never an id in use');
});

test('a backup carries a sound\'s group and the person\'s groups, in order; junk is dropped', async () => {
  const state = {
    people: [{ id: 'p-new-1', name: 'Nana', color: '#0C5E4B', added: true, created: 5 }],
    clips: [
      { id: 'user-a-1', personId: 'p-new-1', label: 'Boom', voice: 'normal', mime: 'audio/webm', created: 1, group: 'g-drums', blob: new Blob([bytes(1)], { type: 'audio/webm' }) },
      { id: 'user-a-2', personId: 'p-new-1', label: 'Bad', voice: 'normal', mime: 'audio/webm', created: 2, group: '<script>', blob: new Blob([bytes(2)], { type: 'audio/webm' }) },
    ],
    overrides: [],
    orders: [{ personId: 'p-new-1', ids: ['user-a-2', 'user-a-1'], groups: [{ id: 'g-silly', name: 'Silly' }, { id: 'g-drums', name: 'Drums' }, { id: 'bad', name: 'x' }] }],
    patterns: [],
    beats: [],
  };
  const out = await readBackup(await makeBackup(state), { peopleIds: new Set(), clipIds: new Set() });
  assert.equal(out.clips.find((c) => c.id === 'user-a-1').group, 'g-drums');
  assert.ok(!('group' in out.clips.find((c) => c.id === 'user-a-2')), 'a group id that is not one is left out');
  assert.deepEqual(out.orders, [{ personId: 'p-new-1', ids: ['user-a-2', 'user-a-1'], groups: [{ id: 'g-silly', name: 'Silly' }, { id: 'g-drums', name: 'Drums' }] }]);
});

test('merging: a sound moved into a group is still the same sound, and a group the device lacks comes in', async () => {
  const blob = new Blob([bytes(1, 2)], { type: 'audio/webm' });
  const here = { id: 'user-a-1', personId: 'pip', label: 'Boom', created: 1, blob, group: 'g-1' };
  const local = { clips: [here], orders: [{ personId: 'pip', ids: ['user-a-1'], groups: [{ id: 'g-1', name: 'Mine' }] }] };
  const incoming = {
    clips: [{ ...here, group: 'g-2' }, { id: 'user-b-1', personId: 'pip', label: 'New', created: 2, blob: new Blob([bytes(3)]), group: 'g-2' }],
    orders: [{ personId: 'pip', ids: [], groups: [{ id: 'g-1', name: 'Renamed' }, { id: 'g-2', name: 'Theirs' }] }],
  };
  const merged = await mergeLoaded(local, incoming, { kitIds: [], newId: (p) => `${p}-x` });
  assert.deepEqual(merged.put.clips.map((c) => c.id), ['user-b-1'], 'no second copy of Boom');
  assert.deepEqual(merged.put.orders, [{ personId: 'pip', ids: ['user-a-1'], groups: [{ id: 'g-1', name: 'Mine' }, { id: 'g-2', name: 'Theirs' }] }]);
  const again = await mergeLoaded({ ...local, orders: merged.put.orders }, incoming, { kitIds: [], newId: (p) => `${p}-y` });
  assert.deepEqual(again.put.orders, [], 'loading twice changes nothing more');
});

test('a share of several sounds is one bundle named after their group, without the sharer\'s group ids; a remix keeps their names', () => {
  const lists = {
    clips: [clip('user-1', 'g-1', { blob: 'x' }), clip('user-2', 'g-1', { blob: 'y' }), clip('user-3', undefined, { blob: 'z' })],
    orders: [{ personId: 'pip', ids: [], groups: [{ id: 'g-1', name: 'Farm animals' }] }],
  };
  const two = shareBundle('sound', ['user-1', 'user-2'], lists, 'pip');
  assert.equal(two.kind, 'sound');
  assert.equal(two.title, 'Farm animals');
  assert.deepEqual(two.bundle.clips.map((c) => c.id), ['user-1', 'user-2']);
  assert.ok(two.bundle.clips.every((c) => !('group' in c) && !('blob' in c)));
  assert.equal(shareBundle('sound', ['user-1', 'user-3'], lists, 'pip').title, '2 sounds');
  assert.equal(shareBundle('sound', ['user-3'], lists, 'pip').title, 'user-3');
  assert.equal(shareBundle('sound', ['nope'], lists, 'pip'), null);
  assert.equal(shareBundle('sound', 'user-1', lists, 'pip').bundle.clips.length, 1, 'one sound as before');

  let n = 0;
  const newId = (p) => `${p}-r${++n}`;
  const bundle = { clips: two.bundle.clips.map((c) => ({ ...c, sound: `s-${c.id}` })) };
  const remix = shareDoc(bundle, 'juno', [], newId, { kind: 'sound', title: two.title });
  assert.deepEqual(remix.doc.clips.map((c) => c.label), ['user-1', 'user-2'], 'several sounds keep their own names');
  const one = shareDoc({ clips: [bundle.clips[0]] }, 'juno', [], newId, { kind: 'sound', title: 'Moo' });
  assert.equal(one.doc.clips[0].label, 'Moo remix');
});

test('withBulkChanges: knobs replace the knobs and the old voices; Shape it steps stay, after the knobs', () => {
  const c = { id: 'u', voice: 'chipmunk', amount: 2, fx: [{ type: 'voice', voice: 'chipmunk', amount: 2 }, { type: 'echo', repeats: 3, gap: 0.25 }], tweaks: { pitch: 3 }, root: 60 };
  const k = withBulkChanges(c, { knobs: { robot: 1, special: 'clones' } });
  assert.equal(k.voice, 'normal');
  assert.ok(!('amount' in k));
  assert.deepEqual(k.fx, [{ type: 'echo', repeats: 3, gap: 0.25 }]);
  assert.deepEqual(k.tweaks, { robot: 1, special: 'clones', first: true });
  assert.ok(!('root' in k));
  const plain = withBulkChanges({ id: 'v', voice: 'robot', tweaks: { echo: 1 } }, { knobs: { pitch: -4 } });
  assert.deepEqual([plain.voice, plain.fx, plain.tweaks], ['normal', undefined, { pitch: -4 }]);
});

test('withBulkChanges: a voice replaces the chain at its own amount; tweaks replace tweaks; either forgets the note', () => {
  const c = { id: 'u', voice: 'chipmunk', amount: 2, fx: [{ type: 'voice', voice: 'chipmunk' }, { type: 'voice', voice: 'stadium' }], tweaks: { pitch: 3 }, root: 60, emoji: '🐸', color: 'red' };
  const robot = withBulkChanges(c, { voice: 'robot' });
  assert.equal(robot.voice, 'robot');
  assert.ok(!('fx' in robot));
  assert.ok(!('root' in robot));
  assert.deepEqual(robot.tweaks, { pitch: 3 }, 'tweaks untouched');
  assert.equal(c.voice, 'chipmunk', 'the original is not changed');
  const plain = withBulkChanges(c, { tweaks: null });
  assert.ok(!('tweaks' in plain));
  assert.equal(plain.voice, 'chipmunk');
  const look = withBulkChanges(c, { emoji: '🚀', color: 'blue' });
  assert.equal(look.emoji, '🚀');
  assert.equal(look.color, 'blue');
  assert.equal(look.root, 60, 'a new look keeps the note');
});
