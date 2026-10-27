// The cloud's routes (worker/cloud.js) as functions, with `fetch` passed in so
// the tests can point them straight at the Worker. Every failure is a
// CloudError: `status` 0 when the network or the API isn't there, else the
// HTTP status, with what the Worker said (`error`, `wait`, `tries`, `over`, `mine`, `network`).
//
// A person id goes to the cloud only when it is a random one (reid.js
// CLOUD_ID): any other is refused here, before anything is sent, as a
// CloudError 400 'id', with no exception.

import { isCloudId } from './reid.js';

export class CloudError extends Error {
  constructor(status, data = {}) {
    super(data.error || (status ? `HTTP ${status}` : 'offline'));
    this.status = status;
    Object.assign(this, data);
  }
}

// `meta()`: what the device says about itself on every call (device-meta.js appMeta:
// the app's version, a screen-width bucket, touch), in the X-Noodle-App header.
export function createCloudApi({ fetch, base = '/api', meta = null }) {
  // A call stopped by its `signal` (☁️ Open from the cloud's stall watch,
  // cloud.js bringDown) is a CloudError 0 'stalled', like a lost network.
  const stalled = () => new CloudError(0, { error: 'stalled' });
  async function call(method, path, { body, key, raw, type, signal } = {}) {
    const headers = {};
    if (key) headers.Authorization = `Bearer ${key}`;
    if (meta) {
      // No header at all when meta() says nothing (the usage switch is off).
      try { const m = meta(); if (m) headers['X-Noodle-App'] = m; } catch { /* never stops a call */ }
    }
    let payload;
    if (raw !== undefined) { payload = raw; headers['Content-Type'] = type || 'application/octet-stream'; }
    else if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
    let res;
    try {
      res = await fetch(`${base}/${path}`, signal ? { method, headers, body: payload, signal } : { method, headers, body: payload });
    } catch {
      throw signal?.aborted ? stalled() : new CloudError(0, { error: 'offline' });
    }
    const isJson = (res.headers?.get?.('Content-Type') || '').startsWith('application/json');
    const data = isJson ? await res.json().catch(() => ({})) : {};
    if (signal?.aborted) throw stalled();
    // A 429 that names no reason is a minute's wait, as the Worker's own
    // 'slow' (worker/cloud.js slowDown): the edge's per-IP rate-limit rule
    // answers in a page of its own, never the Worker's JSON.
    if (res.status === 429 && !data.error) throw new CloudError(429, { ...data, error: 'slow' });
    // A page with no API (the dev server, a static copy) answers 404 in plain text or HTML.
    if (!isJson) throw new CloudError(res.ok ? 0 : res.status === 404 ? 0 : res.status, { error: 'no cloud' });
    if (!res.ok) throw new CloudError(res.status, data);
    return data;
  }
  const enc = encodeURIComponent;
  // A person id for a path, or a refusal before anything is sent.
  const pid = (id) => {
    if (!isCloudId(id)) throw new CloudError(400, { error: 'id' });
    return enc(id);
  };
  // Each route's id check comes first, so a refused id throws as a
  // rejected promise, like any other CloudError.
  const checked = (method, path, opts) => Promise.resolve().then(() => call(method, path(), opts));
  return {
    // The dev server answers {ok: false}: a copy with no cloud.
    async hello() {
      const data = await call('GET', 'cloud');
      if (data.ok !== true) throw new CloudError(0, { error: 'no cloud' });
      return data;
    },
    list: () => call('GET', 'profiles'),
    create: (look) => checked('POST', () => { pid(look?.id); return 'profiles'; }, { body: look }),
    // `remember: false` gets a key this device keeps in memory only.
    open: (id, pin, remember = true) => checked('POST', () => `profiles/${pid(id)}/open`, { body: { ...(pin ? { pin } : {}), remember } }),
    forget: (id, key) => checked('DELETE', () => `profiles/${pid(id)}/key`, { key }),
    // How many devices remember the profile: {count}. Forget all devices deletes every key, this one's too, after the PIN.
    keyCount: (id, key) => checked('GET', () => `profiles/${pid(id)}/keys`, { key }),
    forgetAll: (id, key, pin) => checked('DELETE', () => `profiles/${pid(id)}/keys`, { key, body: { pin } }),
    change: (id, key, changes) => checked('PATCH', () => `profiles/${pid(id)}`, { key, body: changes }),
    remove: (id, key, pin) => checked('DELETE', () => `profiles/${pid(id)}`, { key, body: pin ? { pin } : {} }),
    pull: (id, key, since, signal) => checked('GET', () => `profiles/${pid(id)}/records?since=${since}`, { key, signal }),
    // `since`: the rev this device pulled up to; records written after it come back in `stale`.
    push: (id, key, put, del, since, signal) => checked('POST', () => `profiles/${pid(id)}/records`, { key, body: since === undefined ? { put, del } : { put, del, since }, signal }),
    startSound: (id, key, meta) => checked('POST', () => `profiles/${pid(id)}/sounds`, { key, body: meta }),
    putPiece: (sound, n, key, blob) => call('PUT', `sounds/${enc(sound)}/${n}`, { key, raw: blob }),
    soundUrl: (sound) => `${base}/sounds/${enc(sound)}`,
    // With `onBytes`, the audio is read as it arrives and `onBytes(n)` hears
    // each piece's size (☁️ Open from the cloud's bar). `max`: more bytes than
    // that is refused as it arrives, never held whole (the record's own size,
    // which comes from outside, so the caller caps it too).
    async fetchSound(sound, mime, { signal, onBytes, max } = {}) {
      let res;
      try {
        res = await fetch(`${base}/sounds/${enc(sound)}`, signal ? { signal } : undefined);
      } catch {
        throw signal?.aborted ? stalled() : new CloudError(0, { error: 'offline' });
      }
      // Over the download limit (worker/cloud.js getSound): a minute's wait, as any 429 'slow'.
      if (!res.ok) throw new CloudError(res.status, { error: res.status === 429 ? 'slow' : 'sound' });
      let blob;
      const reader = (onBytes || max) && res.body?.getReader ? res.body.getReader() : null;
      try {
        if (reader) {
          const pieces = [];
          let got = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            got += value.byteLength;
            if (max && got > max) { reader.cancel().catch(() => {}); throw new CloudError(0, { error: 'sound size' }); }
            pieces.push(value);
            onBytes?.(value.byteLength);
          }
          blob = new Blob(pieces, { type: res.headers?.get?.('Content-Type') || '' });
        } else {
          blob = await res.blob();
          if (max && blob.size > max) throw new CloudError(0, { error: 'sound size' });
          onBytes?.(blob.size);
        }
      } catch (err) {
        if (err instanceof CloudError) throw err;
        throw signal?.aborted ? stalled() : new CloudError(0, { error: 'offline' });
      }
      return mime && blob.type !== mime ? new Blob([blob], { type: mime }) : blob;
    },
    share: (id, key, snapshot) => checked('POST', () => `profiles/${pid(id)}/shares`, { key, body: snapshot }),
    shared: (code) => call('GET', `shares/${enc(code)}`),
    myShares: (id, key) => checked('GET', () => `profiles/${pid(id)}/shares`, { key }),
    unshare: (id, key, code) => checked('DELETE', () => `profiles/${pid(id)}/shares/${enc(code)}`, { key }),
  };
}

// What to tell a kid about a CloudError, in one plain sentence.
export function cloudTrouble(err) {
  if (!(err instanceof CloudError)) return 'Something went wrong with the cloud. Everything is still here on this device.';
  if (err.status === 0) return "The cloud isn't reachable from here. Everything still works on this device.";
  if (err.status === 503) return 'The cloud is resting until tomorrow. Everything still works here, and it will catch up.';
  if (err.status === 429 && err.wait) {
    // The waits double up to a day (worker/pin.js): over two hours is said in hours.
    const minutes = Math.ceil(err.wait / 60);
    return `Too many wrong tries. Wait ${minutes > 120 ? `${Math.ceil(minutes / 60)} hours` : `${minutes} minutes`}, then try again.`;
  }
  // A minute's rate limit (worker/cloud.js slowDown), apart from the daily caps.
  if (err.status === 429 && err.error === 'slow') return 'The cloud is busy right now. Try again in a minute.';
  // One profile's daily allowance (worker/cloud.js withinProfileDaily), apart from the site's.
  if (err.status === 429 && err.mine) return 'This profile has done a lot in the cloud today. It catches up tomorrow, and everything still works here.';
  // New profiles from one network's address, 3 a day (worker/cloud.js makeProfile, `network`), apart from the site's.
  if (err.status === 429 && err.network) return 'This network has put as many people in the cloud as it can today. Try again tomorrow.';
  if (err.status === 429) return 'The cloud is busy today. Try again tomorrow.';
  // From the 2nd wrong try the pad also says who to ask, before the wait (council, 2026-10-27).
  if (err.status === 401 && err.error === 'pin') return `That PIN isn't right. ${err.tries} ${err.tries === 1 ? 'try' : 'tries'} left.${err.tries <= 3 ? ' Ask a grown-up for the PIN.' : ''}`;
  if (err.status === 401) return 'This device needs to open this profile again (its PIN changed).';
  if (err.status === 404 && err.error === 'profile') return "That profile isn't in the cloud any more.";
  // The Worker makes no profile without a PIN (worker/cloud.js makeProfile): only a copy of the app from before says it.
  if (err.status === 400 && err.error === 'needs pin') return 'A grown-up puts someone in the cloud, with a PIN, in their profile.';
  if (err.status === 404 && err.error === 'share') return 'No share has that code. Check it and try again.';
  if (err.status === 507 && err.error === 'shares full') return 'This profile has shared as much as it can.';
  if (err.status === 507 && err.error === 'records full') return "The cloud is full for this profile. Delete some takes, beats, songs or shares, then try again.";
  if (err.status === 507 && err.error === 'cloud full') return 'The cloud is full for everyone right now. Everything still works on this device.';
  if (err.status === 507) return "The cloud is full for this profile. Delete some sounds, then try again.";
  return `The cloud said no (${err.error || err.status}). Everything is still here on this device.`;
}
