// A stand-in for Cloudflare D1 on Node's own SQLite (node:sqlite), so the
// Worker's real SQL runs against worker/schema.sql in the tests. It copies
// the parts of D1's API the Worker uses: prepare().bind() with first(), all()
// and run(), and batch() as one transaction. Like D1, it refuses `undefined`
// as a bound value. `fail` makes every query throw, as D1 does once a daily
// limit is used up.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../worker/schema.sql', import.meta.url), 'utf8');

function value(v) {
  if (v === undefined) throw new Error('D1_TYPE_ERROR: Type undefined is not supported');
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  return v;
}

const plain = (row) => (row ? { ...row } : null);

class Statement {
  constructor(d1, sql, params = []) { this.d1 = d1; this.sql = sql; this.params = params; }
  bind(...params) { return new Statement(this.d1, this.sql, params.map(value)); }
  #stmt() {
    this.d1.check();
    this.d1.queries.push(this.sql);
    return this.d1.db.prepare(this.sql);
  }
  run_() {
    const stmt = this.#stmt();
    if (stmt.columns().length) return { results: stmt.all(...this.params).map(plain), success: true, meta: {} };
    const r = stmt.run(...this.params);
    return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async first(column) {
    const row = plain(this.#stmt().get(...this.params));
    if (column) return row ? row[column] : null;
    return row;
  }
  async all() { return this.run_(); }
  async run() { return this.run_(); }
}

export class FakeD1 {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec(schema);
    this.queries = [];
    this.fail = null;
  }
  check() { if (this.fail) throw new Error(this.fail); }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) {
    this.check();
    this.db.exec('BEGIN');
    try {
      const out = statements.map((s) => s.run_());
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
  async exec(sql) { this.check(); this.db.exec(sql); return { count: 1 }; }
  // For tests: one query's rows, straight.
  rows(sql, ...params) { return this.db.prepare(sql).all(...params).map(plain); }
}
