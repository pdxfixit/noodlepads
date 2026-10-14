import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zip, unzip, crc32 } from '../web/zip.js';
import { buildZip, blobOf, bytes, utf8, failure } from './helpers.mjs';

const asBytes = async (blob) => new Uint8Array(await blob.arrayBuffer());

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(utf8('123456789')), 0xCBF43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('zip then unzip returns the same names and bytes', async () => {
  const files = [
    { name: 'backup.json', data: utf8('{"a":1}') },
    { name: 'sounds/user-x.webm', data: bytes(0, 1, 2, 255, 254) },
    { name: 'empty.bin', data: new Uint8Array(0) },
    { name: 'sounds/ünï-🔊.wav', data: bytes(9) },
  ];
  const out = await unzip(zip(files));
  assert.deepEqual([...out.keys()], files.map((f) => f.name));
  for (const f of files) assert.deepEqual(out.get(f.name), f.data);
});

test('reads deflated entries, as another tool would write them', async () => {
  const text = utf8('hello hello hello hello hello '.repeat(50));
  const out = await unzip(blobOf(buildZip([
    { name: 'a.txt', data: text, method: 8 },
    { name: 'b.bin', data: bytes(1, 2, 3), method: 0 },
  ])));
  assert.deepEqual(out.get('a.txt'), text);
  assert.deepEqual(out.get('b.bin'), bytes(1, 2, 3));
});

test('skips folder entries', async () => {
  const out = await unzip(blobOf(buildZip([{ name: 'sounds/' }, { name: 'sounds/a', data: bytes(1) }])));
  assert.deepEqual([...out.keys()], ['sounds/a']);
});

test('finds the end record after a zip comment', async () => {
  const out = await unzip(blobOf(buildZip([{ name: 'a', data: bytes(1) }], { comment: 'made elsewhere' })));
  assert.deepEqual(out.get('a'), bytes(1));
});

test('refuses a file that is not a zip', async () => {
  assert.match(await failure(unzip(blobOf(utf8('just some text, not a zip')))), /isn't a zip/);
  assert.match(await failure(unzip(blobOf(new Uint8Array(0)))), /isn't a zip/);
  assert.match(await failure(unzip(blobOf(bytes(1, 2, 3)))), /isn't a zip/);
});

test('refuses a zip cut short', async () => {
  const whole = await asBytes(zip([{ name: 'a', data: bytes(1, 2, 3) }]));
  assert.match(await failure(unzip(blobOf(whole.subarray(0, whole.length - 10)))), /isn't a zip/);
});

test('refuses a damaged entry (CRC mismatch)', async () => {
  const whole = await asBytes(zip([{ name: 'a', data: utf8('some bytes here') }]));
  whole[30 + 1 + 3] ^= 0xff;  // inside the stored data
  assert.match(await failure(unzip(blobOf(whole))), /“a” is damaged/);
});

test('refuses a CRC that does not match, even when the data is intact', async () => {
  const bad = buildZip([{ name: 'a', data: bytes(1, 2, 3), crc: 12345 }]);
  assert.match(await failure(unzip(blobOf(bad))), /damaged/);
});

test('refuses a declared size that does not match the data', async () => {
  const bad = buildZip([{ name: 'a', data: bytes(1, 2, 3), size: 2, compSize: 3 }]);
  assert.match(await failure(unzip(blobOf(bad))), /damaged/);
});

test('refuses a damaged file list', async () => {
  const whole = await asBytes(zip([{ name: 'a', data: bytes(1) }]));
  const cd = 30 + 1 + 1;  // where the central directory starts
  whole[cd] = 0;
  assert.match(await failure(unzip(blobOf(whole))), /file list is damaged/);
});

test('refuses an entry whose local header is gone', async () => {
  const whole = await asBytes(zip([{ name: 'a', data: bytes(1) }]));
  whole[0] = 0;
  assert.match(await failure(unzip(blobOf(whole))), /“a” is damaged/);
});

test('refuses an entry that runs past the end of the file', async () => {
  const bad = buildZip([{ name: 'a', data: bytes(1, 2, 3), compSize: 5000, size: 5000 }]);
  assert.match(await failure(unzip(blobOf(bad))), /cut short/);
});

test('refuses ZIP64', async () => {
  const bad = buildZip([{ name: 'a', data: bytes(1), size: 0xFFFFFFFF, compSize: 0xFFFFFFFF }]);
  assert.match(await failure(unzip(blobOf(bad))), /ZIP64/);
});

test('refuses a compression method it cannot read', async () => {
  const bad = buildZip([{ name: 'a', data: bytes(1), method: 12 }]);
  assert.match(await failure(unzip(blobOf(bad))), /compression/);
});

test('refuses too many entries', async () => {
  const many = buildZip([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
  assert.match(await failure(unzip(blobOf(many), { maxEntries: 2 })), /more than a backup ever should/);
});

test('refuses an archive that unpacks to more than the limit', async () => {
  const z = zip([{ name: 'a', data: new Uint8Array(600) }, { name: 'b', data: new Uint8Array(600) }]);
  assert.match(await failure(unzip(z, { maxBytes: 1000 })), /more than this app will load/);
});

test('refuses a file too big to be a backup before reading it', async () => {
  const z = zip([{ name: 'a', data: new Uint8Array(5000) }]);
  assert.match(await failure(unzip(z, { maxBytes: 1000 })), /(more than this app will load|bigger than)/);
});

test('a deflate bomb that lies about its size is stopped, not inflated', async () => {
  // Says it unpacks to 10 bytes; really unpacks to 5 MB of zeros.
  const bomb = buildZip([{ name: 'a', data: new Uint8Array(5 * 1024 * 1024), method: 8, size: 10, crc: 0 }]);
  assert.match(await failure(unzip(blobOf(bomb))), /damaged/);
});

test('garbled deflate data is a damaged entry, not a crash', async () => {
  const bad = buildZip([{ name: 'a', data: bytes(0xff, 0xff, 0xff, 0xff, 0xff), method: 8, raw: true, size: 4, crc: 0 }]);
  assert.match(await failure(unzip(blobOf(bad))), /“a” is damaged/);
});

test('two entries with the same name are refused', async () => {
  const bad = buildZip([{ name: 'backup.json', data: bytes(1) }, { name: 'backup.json', data: bytes(2) }]);
  assert.match(await failure(unzip(blobOf(bad))), /twice/);
});
