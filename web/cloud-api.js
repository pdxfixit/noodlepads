// The cloud's routes (worker/cloud.js) as functions, with `fetch` passed in so
// the tests can point them straight at the Worker. Every failure is a
// CloudError: `status` 0 when the network or the API isn't there, else the
// HTTP status, with what the Worker said (`error`, `wait`, `tries`, `over`).
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

// `meta()`: what the device says about itself on every call (uses.js appMeta:
// the app's version, a screen-width bucket, touch), in the X-Noodle-App header.
export function createCloudApi({ fetch, base = '/api', meta = null }) {
  async function call(method, path, { body, key, raw, type } = {}) {
    const headers = {};
    if (key) headers.Authorization = `Bearer ${key}`;
    if (meta) {
      try { headers['X-Noodle-App'] = meta(); } catch { /* never stops a call */ }
    }
    let payload;
    if (raw !== undefined) { payload = raw; headers['Content-Type'] = type || 'application/octet-stream'; }
    else if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
    let res;
    try {
      res = await fetch(`${base}/${path}`, { method, headers, body: payload });
    } catch {
      throw new CloudError(0, { error: 'offline' });
    }
    const isJson = (res.headers?.get?.('Content-Type') || '').startsWith('application/json');
    const data = isJson ? await res.json().catch(() => ({})) : {};
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
    change: (id, key, changes) => checked('PATCH', () => `profiles/${pid(id)}`, { key, body: changes }),
    remove: (id, key, pin) => checked('DELETE', () => `profiles/${pid(id)}`, { key, body: pin ? { pin } : {} }),
    pull: (id, key, since) => checked('GET', () => `profiles/${pid(id)}/records?since=${since}`, { key }),
    // `since`: the rev this device pulled up to; records written after it come back in `stale`.
    push: (id, key, put, del, since) => checked('POST', () => `profiles/${pid(id)}/records`, { key, body: since === undefined ? { put, del } : { put, del, since } }),
    startSound: (id, key, meta) => checked('POST', () => `profiles/${pid(id)}/sounds`, { key, body: meta }),
    putPiece: (sound, n, key, blob) => call('PUT', `sounds/${enc(sound)}/${n}`, { key, raw: blob }),
    soundUrl: (sound) => `${base}/sounds/${enc(sound)}`,
    async fetchSound(sound, mime) {
      let res;
      try { res = await fetch(`${base}/sounds/${enc(sound)}`); } catch { throw new CloudError(0, { error: 'offline' }); }
      if (!res.ok) throw new CloudError(res.status, { error: 'sound' });
      const blob = await res.blob();
      return mime && blob.type !== mime ? new Blob([blob], { type: mime }) : blob;
    },
    // Feature-use counts (uses.js) for the cloud to add up, {feature: n}, and
    // finished visits (visits.js), [{at, secs, …}]; either may be null.
    uses: (id, key, counts, visits = null) => checked('POST', () => `profiles/${pid(id)}/uses`, {
      key, body: { ...(counts ? { uses: counts } : {}), ...(visits ? { visits } : {}) },
    }),
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
  if (err.status === 429 && err.wait) return `Too many wrong tries. Wait ${Math.ceil(err.wait / 60)} minutes, then try again.`;
  if (err.status === 429) return 'The cloud is busy today. Try again tomorrow.';
  if (err.status === 401 && err.error === 'pin') return `That PIN isn't right. ${err.tries} ${err.tries === 1 ? 'try' : 'tries'} left before a 10-minute wait.`;
  if (err.status === 401) return 'This device needs to open this profile again (its PIN changed).';
  if (err.status === 404 && err.error === 'profile') return "That profile isn't in the cloud any more.";
  if (err.status === 404 && err.error === 'share') return 'No share has that code. Check it and try again.';
  if (err.status === 507 && err.error === 'shares full') return 'This profile has shared as much as it can.';
  if (err.status === 507) return "The cloud is full for this profile. Delete some sounds, then try again.";
  return `The cloud said no (${err.error || err.status}). Everything is still here on this device.`;
}
