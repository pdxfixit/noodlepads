#!/usr/bin/env python3
"""Noodle Pads problem reports, read from the telemetry runner's mirror.

The site's Worker keeps each report in D1 (table `reports`, ADR 0009) for 14
days. The telemetry runner (pdxfixit/telemetry) is the only thing that copies
them out (Ben, 2026-10-16: "the telemetry tooling needs to take this over"):
its `noodlepads` job harvests `reports`, and `telemetry.py pull` brings them
to this Mac as the table `noodlepads__reports` in
~/.local/state/telemetry/telemetry.sqlite3 (or $TELEMETRY_DB). This tool only
reads that mirror; it never writes it, and never talks to Cloudflare.

  logs.py                       the last 20 uploads, newest first
  logs.py --errors              only uploads with errors
  logs.py K7Q4-M2XD             one device's uploads, each with its event log
  logs.py --json KEY            one upload as raw JSON
  logs.py --grep TEXT           errors and notices whose text contains TEXT
  logs.py --sql 'SELECT ...'    a query against the mirror (read only; views
                                uploads and events, and every mirrored table)
  logs.py --digest              errors and notices since the last marked digest, grouped
  logs.py --digest --file-new TODO.md
                                the same, and add one "Agents do" line per new kind
                                of error (an error already in the file is skipped)
  logs.py --digest --mark       the same, and record it as the last digest

The last marked digest is kept in ~/.local/state/noodlepads/logs-digest.json
(or $NOODLE_LOGS_DIGEST), since the mirror is read only.

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
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import cloud_config  # noqa: E402

EPOCH = "1970-01-01T00:00:00.000Z"
# The runner's job and table: harvest job `noodlepads`, D1 table `reports`.
REPORTS = "noodlepads__reports"

# The mirror's reports, read as the two shapes the readers below use.
# A report's key starts with the ISO time the Worker stored it (24 characters).
VIEWS = f"""
CREATE TEMP VIEW uploads AS
  SELECT key, substr(key, 1, 24) AS received, device, app, errors, body AS payload FROM main."{REPORTS}";
CREATE TEMP VIEW events AS
  SELECT r.key AS upload, CAST(e.key AS INTEGER) AS seq, json_extract(e.value, '$.t') AS t,
         COALESCE(json_extract(e.value, '$.kind'), '?') AS kind, json_extract(e.value, '$.data') AS data
  FROM main."{REPORTS}" r, json_each(CASE WHEN json_valid(r.body) THEN r.body ELSE '{{}}' END, '$.entries') e;
"""


class Fail(Exception):
    """A failure to report in one line and exit non-zero. Never read as "no data"."""


class NoReports(Exception):
    """The mirror is there, but no run has brought any reports into it yet."""


def utcnow():
    return dt.datetime.now(dt.timezone.utc)


def iso(t):
    """UTC with milliseconds, as JavaScript's toISOString writes the report keys, so the two sort together."""
    t = t.astimezone(dt.timezone.utc)
    return t.strftime("%Y-%m-%dT%H:%M:%S.") + f"{t.microsecond // 1000:03d}Z"


def mirror_path(home=None):
    return Path(os.environ.get("TELEMETRY_DB")
                or Path(home or Path.home()) / ".local/state/telemetry/telemetry.sqlite3").expanduser()


def digest_state_path(home=None):
    return Path(os.environ.get("NOODLE_LOGS_DIGEST") or cloud_config.state_dir(home) / "logs-digest.json").expanduser()


def connect(path=None):
    """The mirror, read only, with the views `uploads` and `events`. Fail when it
    is missing (never created here); NoReports when it has no reports table yet."""
    path = Path(path or mirror_path())
    if not path.exists():
        raise Fail(f"no telemetry mirror at {path}: run `python3 ~/src/telemetry/telemetry.py pull` first")
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    if not conn.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (REPORTS,)).fetchone():
        conn.close()
        raise NoReports(f"the mirror ({path}) has no {REPORTS} yet: the runner harvests reports once "
                        "site/harvest.conf names them (docs/state.md, To do)")
    conn.executescript(VIEWS)
    return conn


def last_digest(path=None):
    try:
        return json.loads(Path(path or digest_state_path()).read_text()).get("last_digest") or EPOCH
    except FileNotFoundError:
        return EPOCH


def mark_digest(when, path=None):
    path = Path(path or digest_state_path())
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps({"last_digest": when}) + "\n")
    os.replace(tmp, path)


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
        raise Fail(f"no upload {key!r} in the mirror")
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
    ap.add_argument("--digest", action="store_true")
    ap.add_argument("--mark", action="store_true", help="with --digest: record this as the last digest")
    ap.add_argument("--file-new", metavar="TODO_MD", help="with --digest: add new kinds of error to this TODO.md")
    ap.add_argument("--limit", type=int, default=20)
    args = ap.parse_args(argv)
    if (args.mark or args.file_new) and not args.digest:
        ap.error("--mark and --file-new go with --digest")
    try:
        conn = connect()
        if args.digest:
            now = utcnow()
            md, new = digest(conn, last_digest(), now)
            print(md)
            if args.file_new:
                file_new(args.file_new, new)
            if args.mark:
                mark_digest(iso(now))
        elif args.sql:
            run_sql(conn, args.sql)
        elif args.json:
            show_json(conn, args.json)
        elif args.grep:
            grep(conn, args.grep)
        elif args.device:
            show_device(conn, args.device, args.limit)
        else:
            list_uploads(conn, "WHERE errors > 0" if args.errors else "", (), args.limit)
    except NoReports as e:
        # A known state, not a failure: nothing to read until the harvest names reports.
        print(f"⏳ {e}")
        return 0
    except Fail as e:
        print(f"🛑 {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
