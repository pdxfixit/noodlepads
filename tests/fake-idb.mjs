// A stand-in for IndexedDB, in memory: enough for store.js (open with an
// upgrade, transactions over one store or several, put, delete, getAll) so a
// test can start the real app on a device that already has data. A
// transaction is all or nothing, as IndexedDB's is: its requests run when it
// commits, and `failCommit(n)` makes the next n commits abort with nothing
// written, the way a full disk or a closed tab would.

export function fakeIndexedDB() {
  const databases = new Map();   // name -> {version, stores: Map(name -> {keyPath, rows: Map})}
  let failing = 0;

  function database(name) {
    const d = databases.get(name);
    const handle = {
      get objectStoreNames() { return [...d.stores.keys()]; },
      createObjectStore(store, { keyPath }) { d.stores.set(store, { keyPath, rows: new Map() }); },
      close() {},
      onversionchange: null,
      transaction(names, mode = 'readonly') {
        const list = Array.isArray(names) ? names : [names];
        for (const n of list) if (!d.stores.has(n)) throw new Error(`NotFoundError: no store ${n}`);
        const queued = [];
        const tx = {
          error: null, oncomplete: null, onerror: null, onabort: null,
          objectStore(n) {
            if (!list.includes(n)) throw new Error(`NotFoundError: ${n} is not in this transaction`);
            const { keyPath, rows } = d.stores.get(n);
            const request = (run) => { const req = { result: undefined }; queued.push(() => { req.result = run(); }); return req; };
            const writable = () => { if (mode !== 'readwrite') throw new Error('ReadOnlyError'); };
            return {
              put(value) { writable(); return request(() => { rows.set(value[keyPath], value); return value[keyPath]; }); },
              delete(key) { writable(); return request(() => { rows.delete(key); }); },
              getAll() { return request(() => [...rows.values()]); },
            };
          },
        };
        setTimeout(() => {
          if (failing > 0) {
            failing--;
            tx.error = new Error('AbortError: the transaction was aborted');
            tx.onabort?.();
            return;
          }
          const saved = new Map([...d.stores].map(([n, s]) => [n, new Map(s.rows)]));
          try {
            for (const run of queued) run();
          } catch (err) {
            for (const [n, rows] of saved) d.stores.get(n).rows = rows;
            tx.error = err;
            tx.onerror?.();
            return;
          }
          tx.oncomplete?.();
        });
        return tx;
      },
    };
    return handle;
  }

  return {
    databases: async () => [...databases].map(([name, d]) => ({ name, version: d.version })),
    open(name, version) {
      const req = { result: null, error: null };
      setTimeout(() => {
        const had = databases.get(name);
        if (!had) databases.set(name, { version: 0, stores: new Map() });
        const d = databases.get(name);
        req.result = database(name);
        if (version > d.version) {
          const oldVersion = d.version;
          d.version = version;
          req.onupgradeneeded?.({ oldVersion });
        }
        req.onsuccess?.();
      });
      return req;
    },
    deleteDatabase: () => { throw new Error('not used'); },
    // Test helpers: what a store holds now, filling stores before the app
    // starts, and making the next commits fail.
    rows: (name, store) => [...(databases.get(name)?.stores.get(store)?.rows.values() ?? [])],
    seed(name, version, schema, data) {
      const stores = new Map(schema.map(({ name: n, keyPath }) => [n, { keyPath, rows: new Map((data[n] ?? []).map((r) => [r[keyPath], r])) }]));
      databases.set(name, { version, stores });
    },
    failCommit(n = 1) { failing = n; },
  };
}
