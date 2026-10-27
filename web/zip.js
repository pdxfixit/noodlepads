// Minimal ZIP, no library: enough for soundboard backups. Writes stored
// (uncompressed) entries, since audio barely compresses; reads stored or
// deflated entries, so a backup re-zipped by another tool still opens.
// No ZIP64, encryption or multi-disk archives.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

// files: [{name, data: Uint8Array}] -> Blob (application/zip)
export function zip(files, when = new Date()) {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(when);
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);         // version needed
    local.setUint16(6, 0x0800, true);     // UTF-8 names
    local.setUint16(8, 0, true);          // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(local, name, f.data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, f.data.length, true);
    cd.setUint32(24, f.data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(cd, name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((n, p) => n + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

// Inflates `bytes`, giving up as soon as the output passes `limit`. A deflate
// stream can claim to be small and unpack to gigabytes, so the size an entry
// declares is a limit to enforce, not a number to trust.
async function inflate(bytes, limit) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { await reader.cancel(); throw new Error('unpacks to more than it says'); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

// The most a zip may unpack to in all. backup.js saves within it, so a backup
// that saved also loads.
export const MAX_UNZIP_BYTES = 300 * 1024 * 1024;

// Blob -> Map(name -> Uint8Array). The file is untrusted, so it refuses
// anything over `maxBytes` unpacked or `maxEntries` entries, and checks CRCs.
export async function unzip(blob, { maxBytes = MAX_UNZIP_BYTES, maxEntries = 5000 } = {}) {
  // Entries are stored or deflated, so an honest archive is rarely bigger than
  // what it unpacks to; refuse before reading a huge file into memory.
  if (blob.size > maxBytes + 1024 * 1024) throw new Error('it is bigger than this app will load');
  const buf = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(buf.buffer);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("this isn't a zip file");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  if (count > maxEntries) throw new Error(`it has ${count} files, more than a backup ever should`);
  const dec = new TextDecoder();
  const out = new Map();
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || view.getUint32(p, true) !== 0x02014b50) throw new Error('its file list is damaged');
    const method = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    const compSize = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;  // a folder
    if (out.has(name)) throw new Error(`“${name}” is in it twice`);
    if (compSize === 0xFFFFFFFF || size === 0xFFFFFFFF) throw new Error('it uses ZIP64, which this app can\'t read');
    total += size;
    if (total > maxBytes) throw new Error('it unpacks to more than this app will load');
    if (local + 30 > buf.length || view.getUint32(local, true) !== 0x04034b50) throw new Error(`“${name}” is damaged`);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + compSize > buf.length) throw new Error(`“${name}” is cut short`);
    const raw = buf.subarray(start, start + compSize);
    let data;
    if (method === 0) data = raw.slice();
    else if (method === 8) {
      try { data = await inflate(raw, size); } catch { throw new Error(`“${name}” is damaged`); }
    } else throw new Error(`“${name}” uses a compression this app can't read`);
    if (data.length !== size || crc32(data) !== crc) throw new Error(`“${name}” is damaged`);
    out.set(name, data);
  }
  return out;
}
