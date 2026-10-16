#!/usr/bin/env python3
"""Noodle Pads problem reports: copy them from the site's D1 database (table
`reports`, ADR 0009) into a local SQLite archive, and read that archive.

D1 holds each upload for 14 days. `--sync` copies new ones into the archive,
which keeps them forever. Everything else reads only the archive.

  logs.py                       the last 20 uploads, newest first
  logs.py --errors              only uploads with errors
  logs.py K7Q4-M2XD             one device's uploads, each with its event log
  logs.py --json KEY            one upload as raw JSON
  logs.py --grep TEXT           errors and notices whose text contains TEXT
  logs.py --sql 'SELECT ...'    a query against the archive (opened read-only)
  logs.py --sync                copy new uploads from D1 (one transaction)
  logs.py --digest              errors and notices since the last marked digest, grouped
  logs.py --digest --file-new TODO.md
                                the same, and add one "Agents do" line per new kind
                                of error (an error already in the file is skipped)
  logs.py --digest --mark       the same, and record it as the last digest

Archive: ~/.local/state/noodlepads/logs.sqlite3, or $NOODLE_LOGS_DB.
D1 account and database: ~/.config/noodlepads/cloud.json (tools/cloud_config.py;
the template is tools/cloud.example.json). The API token (D1: Read) is read
from the macOS Keychain, service `noodlepads-logs`.

Stdlib only, Python 3.8+.
"""
import argparse
import datetime as dt
import json
import os
import re
import shlex
import sqlite3
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import cloud_config  # noqa: E402
API = "https://api.cloudflare.com/client/v4"
EPOCH = "1970-01-01T00:00:00.000Z"

SCHEMA = """
CREATE TABLE IF NOT EXISTS uploads (    -- one row per upload, never deleted
  key TEXT PRIMARY KEY,                 -- the report's key: <ISO time>_<device>_<random>
  received TEXT NOT NULL,               -- ISO time the Worker stored it
  device TEXT, app TEXT, ua TEXT,       -- device code, app version, "browser · OS · type" (families only)
  errors INTEGER NOT NULL,
  payload TEXT NOT NULL                 -- the cleaned upload, as JSON
);
CREATE TABLE IF NOT EXISTS events (     -- each upload's event log, flattened for SQL
  upload TEXT NOT NULL REFERENCES uploads(key),
  seq INTEGER NOT NULL, t TEXT, kind TEXT NOT NULL, data TEXT,   -- data as JSON (json_extract works)
  PRIMARY KEY (upload, seq)
);
CREATE INDEX IF NOT EXISTS events_kind ON events(kind);
CREATE TABLE IF NOT EXISTS meta (       -- the archive's own bookkeeping: last_sync, newest_key, last_digest
  key TEXT PRIMARY KEY, value TEXT
);
"""


class Fail(Exception):
    """A failure to report in one line and exit non-zero. Never read as "no data"."""


def utcnow():
    return dt.datetime.now(dt.timezone.utc)


def iso(t):
    """UTC with milliseconds, as JavaScript's toISOString writes the report keys, so the two sort together."""
    t = t.astimezone(dt.timezone.utc)
    return t.strftime("%Y-%m-%dT%H:%M:%S.") + f"{t.microsecond // 1000:03d}Z"


def db_path():
    return Path(os.environ.get("NOODLE_LOGS_DB") or cloud_config.state_dir() / "logs.sqlite3").expanduser()


def connect(path=None, readonly=False):
    path = Path(path or db_path())
    if readonly:
        if not path.exists():
            raise Fail(f"no archive at {path} yet; run `just logs --sync` first")
        return sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.executescript(SCHEMA)
    return conn


def get_meta(conn, key, default=None):
    row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
    return row[0] if row else default


def set_meta(conn, key, value):
    conn.execute("INSERT INTO meta (key, value) VALUES (?, ?) "
                 "ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, value))


# ── Reading reports from D1 ──

def load_config(path=None):
    try:
        return cloud_config.load(path)
    except cloud_config.ConfigError as e:
        raise Fail(str(e))


def keychain_token(service):
    try:
        return cloud_config.keychain_token(service)
    except cloud_config.ConfigError as e:
        raise Fail(str(e))


def urllib_fetch(url, headers, body=None):
    """GET (or POST `body`) url. Returns (status, body bytes). Network errors raise Fail."""
    req = urllib.request.Request(url, headers=headers, data=body, method="POST" if body is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except (urllib.error.URLError, OSError) as e:
        raise Fail(f"cannot reach Cloudflare: {e}")


class D1Reports:
    """The site's `reports` table, read-only, through D1's query API (POST
    /accounts/<id>/d1/database/<id>/query). keys() lists {name, metadata},
    value(name) gives one upload's bytes. `fetch(url, headers, body)` is
    injectable for tests."""

    PAGE = 1000

    def __init__(self, account_id, database_id, token, fetch=urllib_fetch):
        self.url = f"{API}/accounts/{account_id}/d1/database/{database_id}/query"
        self.headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        self.fetch = fetch

    def query(self, sql, params):
        status, body = self.fetch(self.url, self.headers, json.dumps({"sql": sql, "params": params}).encode())
        try:
            doc = json.loads(body)
        except ValueError:
            raise Fail(f"D1 query: HTTP {status}, not JSON")
        if status != 200 or not doc.get("success"):
            raise Fail(f"D1 query: HTTP {status} {json.dumps(doc.get('errors'))}")
        result = doc.get("result") or [{}]
        return result[0].get("results") or []

    def keys(self):
        """Every report's key, as {name, metadata}. Raises Fail on any error: a half listing is never returned."""
        out, after = [], ""
        while True:
            rows = self.query("SELECT key, app, device, errors FROM reports WHERE key > ? ORDER BY key LIMIT ?",
                              [after, self.PAGE])
            out.extend({"name": r["key"], "metadata": {"app": r.get("app"), "device": r.get("device"),
                                                       "errors": r.get("errors")}} for r in rows)
            if len(rows) < self.PAGE:
                return out
            after = rows[-1]["key"]

    def value(self, name):
        """The upload's bytes, or None if it is gone (expired since the listing)."""
        rows = self.query("SELECT body FROM reports WHERE key = ?", [name])
        return rows[0]["body"].encode() if rows else None


def reports_from_config():
    cfg = load_config()
    return D1Reports(cfg["account_id"], cfg["database_id"], keychain_token(cfg["keychain_service"]))


# ── The archive ──

def parse_key(key):
    """<ISO time>_<device>_<random> -> (received, device)."""
    parts = key.split("_")
    received = parts[0] if parts and re.match(r"^\d{4}-\d{2}-\d{2}T", parts[0]) else ""
    device = parts[1] if len(parts) >= 3 else None
    return received, device


def device_families(env):
    """The device as a report names it: "Chrome · Android · phone". Reports carry only
    the browser, OS and device-type families (web/agent.js), never the User-Agent string.
    A report from before 2026-10-16 had the raw string in env.ua: it is not copied."""
    if not isinstance(env, dict):
        return None
    parts = [env.get(k) for k in ("browser", "os", "type")]
    return " · ".join(p for p in parts if isinstance(p, str) and p) or None


def insert_upload(conn, key, raw, metadata=None):
    """Adds one upload and its events. Returns False when the value was not JSON
    (kept as text, with no events, so it is still there to look at)."""
    received, device = parse_key(key)
    metadata = metadata or {}
    text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else raw
    try:
        payload = json.loads(text)
        if not isinstance(payload, dict):
            raise ValueError("not an object")
    except ValueError:
        conn.execute("INSERT INTO uploads VALUES (?, ?, ?, ?, ?, ?, ?)",
                     (key, received, device, metadata.get("app"), None, 0, text))
        return False
    entries = [e for e in payload.get("entries") or [] if isinstance(e, dict)]
    errors = sum(1 for e in entries if e.get("kind") == "error")
    ua = device_families(payload.get("env"))
    conn.execute("INSERT INTO uploads VALUES (?, ?, ?, ?, ?, ?, ?)",
                 (key, received, payload.get("device") or device, payload.get("app"), ua, errors,
                  json.dumps(payload, ensure_ascii=False, sort_keys=True)))
    conn.executemany("INSERT INTO events VALUES (?, ?, ?, ?, ?)", [
        (key, i, e.get("t"), str(e.get("kind") or "?"), json.dumps(e.get("data"), ensure_ascii=False, sort_keys=True))
        for i, e in enumerate(entries)])
    return True


def sync(conn, kv, now=None, out=sys.stdout):
    """Copy every report in D1 not yet in the archive. Reads everything first, then
    writes in one transaction, so a failure part-way leaves the archive as it was."""
    have = {r[0] for r in conn.execute("SELECT key FROM uploads")}
    listed = kv.keys()
    new = sorted((k for k in listed if k.get("name") and k["name"] not in have), key=lambda k: k["name"])
    fetched, gone = [], 0
    for k in new:
        raw = kv.value(k["name"])
        if raw is None:
            gone += 1
            continue
        fetched.append((k["name"], raw, k.get("metadata")))
    bad = 0
    with conn:
        for name, raw, meta in fetched:
            if not insert_upload(conn, name, raw, meta):
                bad += 1
        set_meta(conn, "last_sync", iso(now or utcnow()))
        if fetched:
            newest = max(f[0] for f in fetched)
            if newest > (get_meta(conn, "newest_key") or ""):
                set_meta(conn, "newest_key", newest)
    stats = {"listed": len(listed), "new": len(fetched), "gone": gone, "bad": bad,
             "newest": get_meta(conn, "newest_key") or ""}
    print(f"✅ synced {stats['new']} new upload(s) of {stats['listed']} in D1"
          + (f"; {gone} expired before they could be read" if gone else "")
          + (f"; ⚠️ {bad} not JSON (kept as text)" if bad else "")
          + (f"; newest {stats['newest']}" if stats["newest"] else ""), file=out)
    return stats


# ── Reading ──

def seconds(ms):
    try:
        return f"+{float(ms) / 1000:.1f}s"
    except (TypeError, ValueError):
        return "+?s"


def list_uploads(conn, where="", args=(), limit=20, out=sys.stdout):
    rows = conn.execute(f"SELECT key, received, device, app, errors FROM uploads {where} "
                        "ORDER BY received DESC, key DESC LIMIT ?", (*args, limit)).fetchall()
    if not rows:
        print("(no uploads)", file=out)
    for key, received, device, app, errors in rows:
        print(f"{received}  {device or '-':9}  {app or '-':22}  {'⚠️ ' + str(errors) + ' error(s)' if errors else 'ok'}"
              f"  {key}", file=out)
    return len(rows)


def show_device(conn, device, limit=20, out=sys.stdout):
    rows = conn.execute("SELECT key, received, app, payload FROM uploads WHERE device = ? "
                        "ORDER BY received DESC, key DESC LIMIT ?", (device, limit)).fetchall()
    if not rows:
        print(f"(no uploads from {device})", file=out)
    for key, received, app, _ in rows:
        events = conn.execute("SELECT t, kind, data FROM events WHERE upload = ? ORDER BY seq", (key,)).fetchall()
        print(f"## {received}  {app or '-'}  ({key})", file=out)
        print(f"Event log ({len(events)} {'entry' if len(events) == 1 else 'entries'}, newest last):", file=out)
        if not events:
            print("  (nothing)", file=out)
        for t, kind, data in events:
            d = json.loads(data) if data else None
            print(f"  {seconds(t)} {kind}{' ' + json.dumps(d, ensure_ascii=False) if d else ''}", file=out)
        print(file=out)
    return len(rows)


def show_json(conn, key, out=sys.stdout):
    row = conn.execute("SELECT payload FROM uploads WHERE key = ?", (key,)).fetchone()
    if not row:
        raise Fail(f"no upload {key!r} in the archive")
    try:
        print(json.dumps(json.loads(row[0]), indent=2, ensure_ascii=False), file=out)
    except ValueError:
        print(row[0], file=out)


def run_sql(conn, query, out=sys.stdout):
    try:
        cur = conn.execute(query)
    except sqlite3.Error as e:
        raise Fail(f"SQL: {e}")
    if cur.description:
        print("\t".join(d[0] for d in cur.description), file=out)
        for row in cur:
            print("\t".join("" if v is None else str(v) for v in row), file=out)


# Errors and notices: the text that names a problem.
PROBLEM_SQL = """
SELECT u.key, u.received, u.device, u.app, e.kind,
       COALESCE(json_extract(e.data, '$.message'), json_extract(e.data, '$.text'), '(no message)')
FROM events e JOIN uploads u ON u.key = e.upload
WHERE e.kind IN ('error', 'notice')
"""


def normalize(text):
    """Messages that differ only in numbers are one kind of problem."""
    return re.sub(r"\d+", "N", " ".join(str(text).split()))


def grep(conn, text, out=sys.stdout):
    rows = conn.execute(PROBLEM_SQL + " AND instr(lower(COALESCE(json_extract(e.data, '$.message'), "
                        "json_extract(e.data, '$.text'), '')), lower(?)) > 0 ORDER BY u.received DESC", (text,)).fetchall()
    for key, received, device, app, kind, message in rows:
        print(f"{received}  {device or '-':9}  {app or '-':22}  {kind}: {message}  ({key})", file=out)
    if not rows:
        print("(nothing matches)", file=out)
    return len(rows)


def digest(conn, since, now):
    """Problems in uploads received after `since`, grouped by kind, message and
    app version. Returns (markdown, new) where `new` lists the kinds of problem
    never seen before `since`: {kind, message, sample, count, devices, apps}."""
    rows = conn.execute(PROBLEM_SQL + " AND u.received > ?", (since,)).fetchall()
    seen_before = {(k, normalize(m)) for _, _, _, _, k, m in conn.execute(PROBLEM_SQL + " AND u.received <= ?", (since,))}
    uploads, devices = conn.execute("SELECT count(*), count(DISTINCT device) FROM uploads WHERE received > ?",
                                    (since,)).fetchone()
    groups = {}
    for key, received, device, app, kind, message in rows:
        g = groups.setdefault((kind, normalize(message), app or "-"),
                              {"count": 0, "devices": set(), "sample": message, "last": ""})
        g["count"] += 1
        g["devices"].add(device)
        if received >= g["last"]:
            g["last"], g["sample"] = received, message
    new = {}
    for (kind, norm, app), g in groups.items():
        if (kind, norm) in seen_before:
            continue
        n = new.setdefault((kind, norm), {"kind": kind, "message": norm, "sample": g["sample"],
                                          "count": 0, "devices": set(), "apps": set()})
        n["count"] += g["count"]
        n["devices"] |= g["devices"]
        n["apps"].add(app)

    frm = "the start" if since == EPOCH else since
    errors = sum(1 for r in rows if r[4] == "error")
    md = [f"# Noodle Pads problem reports: {frm} → {iso(now)}", "",
          f"{uploads} upload(s) from {devices} device(s). {errors} error(s), {len(rows) - errors} notice(s).", ""]
    if groups:
        md += ["| New | Kind | Message | App | Count | Devices |", "|---|---|---|---|---|---|"]
        order = sorted(groups.items(), key=lambda kv: (-kv[1]["count"], kv[0]))
        for (kind, norm, app), g in order:
            cell = g["sample"].replace("|", "\\|")
            md.append(f"| {'🆕' if (kind, norm) in new else ''} | {kind} | {cell} | {app} | {g['count']} | {len(g['devices'])} |")
        md.append("")
    else:
        md += ["No errors or notices.", ""]
    out = []
    for n in sorted(new.values(), key=lambda n: (-n["count"], n["kind"], n["message"])):
        n["devices"] = len(n["devices"])
        n["apps"] = sorted(n["apps"])
        out.append(n)
    if out:
        md += ["## New kinds of problem", ""] + [f"- {todo_line(n)}" for n in out] + [""]
    return "\n".join(md), out


def todo_line(n):
    query = shlex.quote(n["sample"][:60])
    return (f"[ ] Problem report: {n['kind']} “{n['sample']}” ({n['count']}×, {n['devices']} device(s), "
            f"app {', '.join(n['apps'])}). `just logs --grep {query}`")


def file_new(todo_path, new, out=sys.stdout):
    """Adds one "Agents do" line per new kind of error to TODO.md, just above
    "### Offered, not approved". Notices are left to the digest. An error whose
    text is already in the file is skipped, so filing twice adds nothing.
    Prints "filed N" and returns N."""
    path = Path(todo_path)
    text = path.read_text()
    if "## Agents do" not in text:
        raise Fail(f"{path} has no '## Agents do' section")
    lines = [f"- {todo_line(n)}" for n in new if n["kind"] == "error" and n["sample"] not in text]
    if not lines:
        print("📝 filed 0: nothing new", file=out)
        return 0
    head, tail = text.split("## Agents do", 1)
    marker = "### Offered, not approved"
    if marker in tail:
        body, rest = tail.split(marker, 1)
        tail = body.rstrip("\n") + "\n" + "\n".join(lines) + "\n\n" + marker + rest
    else:
        tail = tail.rstrip("\n") + "\n" + "\n".join(lines) + "\n"
    path.write_text(head + "## Agents do" + tail)
    print(f"📝 filed {len(lines)} new kind(s) of error in {path}", file=out)
    return len(lines)


# ── CLI ──

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("device", nargs="?", help="a device code: show its uploads with their event logs")
    ap.add_argument("--errors", action="store_true")
    ap.add_argument("--json", metavar="KEY")
    ap.add_argument("--grep", metavar="TEXT")
    ap.add_argument("--sql", metavar="QUERY")
    ap.add_argument("--sync", action="store_true")
    ap.add_argument("--digest", action="store_true")
    ap.add_argument("--mark", action="store_true", help="with --digest: record this as the last digest")
    ap.add_argument("--file-new", metavar="TODO_MD", help="with --digest: add new kinds of error to this TODO.md")
    ap.add_argument("--limit", type=int, default=20)
    args = ap.parse_args(argv)
    if (args.mark or args.file_new) and not args.digest:
        ap.error("--mark and --file-new go with --digest")
    try:
        if args.sync:
            kv = reports_from_config()  # config and token first: a missing one never creates an empty archive
            sync(connect(), kv)
        elif args.digest:
            conn = connect()
            now = utcnow()
            md, new = digest(conn, get_meta(conn, "last_digest", EPOCH), now)
            print(md)
            if args.file_new:
                file_new(args.file_new, new)
            if args.mark:
                with conn:
                    set_meta(conn, "last_digest", iso(now))
        elif args.sql:
            run_sql(connect(readonly=True), args.sql)
        elif args.json:
            show_json(connect(readonly=True), args.json)
        elif args.grep:
            grep(connect(readonly=True), args.grep)
        elif args.device:
            show_device(connect(readonly=True), args.device, args.limit)
        else:
            list_uploads(connect(readonly=True), "WHERE errors > 0" if args.errors else "", (), args.limit)
    except Fail as e:
        print(f"🛑 {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
