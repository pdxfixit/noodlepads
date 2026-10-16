#!/usr/bin/env python3
"""One-time move of the old Mac archives into the telemetry runner (Ben,
2026-10-16: "i want consistent local storage mirror of this data"; "the
telemetry tooling needs to take this over").

  runner_export.py reports OLD OUT   the old problem-report archive (logs.sqlite3,
                                     table uploads) as the harvest's `reports`
                                     table, with the raw User-Agent taken out
  runner_export.py metrics OLD OUT   the old metrics archive (metrics.sqlite3) as
                                     the harvest's tables only, in its shape: no
                                     city, region, network or ASN, no names or
                                     avatars
  runner_export.py all LOGS METRICS OUT
                                     both in one file: the one to import, since
                                     `telemetry.py import` starts a job's history
                                     once and refuses a job with a stored snapshot
  runner_export.py check FILE        exit 0 when FILE holds only tables in the
                                     harvest's shape, so `telemetry.py import
                                     noodlepads FILE` can take it as history

"The harvest's shape" is what flarepress's tools/harvest.py writes for
site/harvest.conf: D1's own columns (worker/schema.sql), cut by cols=, named by
as=, keyed by D1's key (append) or the line's keys (upsert); plus its own cf_*
and harvest_meta tables. Reports are shaped by REPORTS_LINE, the line
site/harvest.conf gains once no stored report holds a raw User-Agent
(docs/state.md, To do).

OLD is opened read only. OUT must not exist yet. Each writes OUT, checks it,
and prints every table's row count, to compare after the import.

Stdlib only, Python 3.8+.
"""
import argparse
import datetime as dt
import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "worker" / "schema.sql"
HARVEST = ROOT / "site" / "harvest.conf"
# The line site/harvest.conf gains for problem reports, and so the shape they
# are exported in. D1 keeps a report 14 days (worker/reports.js TTL_MS).
REPORTS_LINE = "table=reports upsert key"
REPORT_KEEP_MS = 14 * 24 * 60 * 60 * 1000
# Tables the harvest writes of its own, not from D1: Cloudflare's daily
# analytics and its bookkeeping. They hold no ids.
OWN = re.compile(r"^(cf_[a-z_]+|harvest_meta)$")


class Fail(Exception):
    """A failure to report in one line and exit non-zero."""


# ── The harvest's shape ──

def d1_tables(schema_text):
    """{table: ([(column, type)], [pk columns])} from worker/schema.sql."""
    out = {}
    for name, body in re.findall(r"CREATE TABLE IF NOT EXISTS (\w+) \((.*?)\n\);", schema_text, re.S):
        cols, pk = [], []
        for line in body.splitlines():
            line = line.split("--", 1)[0].strip().rstrip(",")
            if not line:
                continue
            m = re.match(r"PRIMARY KEY \(([^)]*)\)", line)
            if m:
                pk = [c.strip() for c in m.group(1).split(",")]
                continue
            if re.match(r"(UNIQUE|FOREIGN|CHECK|CONSTRAINT)\b", line):
                continue
            words = line.split()
            cols.append((words[0], words[1] if len(words) > 1 else ""))
            if "PRIMARY KEY" in line:
                pk = [words[0]]
        out[name] = (cols, pk)
    return out


def parse_line(value):
    """One harvest.conf table= value: {name, mode, keys, cols, local} (flarepress's rules)."""
    words = value.split()
    t = {"name": words[0], "mode": words[1], "keys": words[2].split(","), "cols": [], "local": words[0]}
    for opt in words[3:]:
        k, _, v = opt.partition("=")
        if k == "cols":
            t["cols"] = v.split(",")
        elif k == "as":
            t["local"] = v
    return t


def harvest_lines(conf_text):
    return [parse_line(l.strip()[len("table="):]) for l in conf_text.splitlines() if l.strip().startswith("table=")]


def shape(schema_text=None, conf_text=None, extra=(REPORTS_LINE,)):
    """{local table: ([(column, type)], [pk])}: what the harvest writes."""
    d1 = d1_tables(schema_text if schema_text is not None else SCHEMA.read_text())
    lines = harvest_lines(conf_text if conf_text is not None else HARVEST.read_text())
    lines += [parse_line(e[len("table="):]) for e in extra]
    out = {}
    for t in lines:
        if t["name"] not in d1:
            continue  # flarepress skips a table D1 lacks
        cols, d1_pk = d1[t["name"]]
        if t["cols"]:
            cols = [c for c in cols if c[0] in t["cols"]]
        pk = (d1_pk or t["keys"]) if t["mode"] == "append" else t["keys"]
        out[t["local"]] = (cols, pk)
    return out


# ── Checking a file ──

def columns(conn, table):
    return [r[1] for r in conn.execute(f'PRAGMA table_info("{table}")')]


def problems(path, want=None):
    """Why FILE is not in the harvest's shape: [] when it is."""
    want = want or shape()
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        out = []
        for (t,) in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table' "
                                 r"AND name NOT LIKE 'sqlite\_%' ESCAPE '\' ORDER BY name"):
            info = conn.execute(f'PRAGMA table_info("{t}")').fetchall()
            if not [r for r in info if r[5]]:
                out.append(f"{t}: no PRIMARY KEY")
            if OWN.match(t):
                continue
            if t not in want:
                out.append(f"{t}: not a table the harvest writes")
                continue
            have, expect = [r[1] for r in info], [c for c, _ in want[t][0]]
            if have != expect:
                extra = [c for c in have if c not in expect]
                missing = [c for c in expect if c not in have]
                out.append(f"{t}: columns {have}, the harvest writes {expect}"
                           + (f" (extra: {', '.join(extra)})" if extra else "")
                           + (f" (missing: {', '.join(missing)})" if missing else ""))
        return out
    finally:
        conn.close()


def counts(path):
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        return {t: conn.execute(f'SELECT count(*) FROM "{t}"').fetchone()[0]
                for (t,) in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")}
    finally:
        conn.close()


# ── Writing ──

def open_old(path):
    path = Path(path).expanduser()
    if not path.is_file():
        raise Fail(f"no archive at {path}")
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True)


def open_new(path):
    path = Path(path).expanduser()
    if path.exists():
        raise Fail(f"{path} is already there: give a new file")
    path.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(str(path))


def create(conn, table, cols, pk):
    defs = ", ".join(f'"{c}" {t}'.rstrip() for c, t in cols)
    conn.execute(f'CREATE TABLE "{table}" ({defs}, PRIMARY KEY ({", ".join(chr(34) + k + chr(34) for k in pk)}))')


def ms(iso_time):
    return int(dt.datetime.fromisoformat(iso_time.replace("Z", "+00:00")).timestamp() * 1000)


def clean_body(text):
    """The upload with the raw User-Agent taken out (env.ua, wherever an older app
    put it), or None when it is not a JSON object."""
    try:
        body = json.loads(text)
    except (TypeError, ValueError):
        return None
    if not isinstance(body, dict):
        return None
    env = body.get("env")
    if isinstance(env, dict):
        env.pop("ua", None)
    body.pop("ua", None)
    return json.dumps(body, ensure_ascii=False, sort_keys=True)


def write_reports(src, dst, want, out):
    """Old logs.sqlite3 `uploads` -> the harvest's `reports`, in dst. Returns {written, skipped}."""
    cols, pk = want["reports"]
    create(dst, "reports", cols, pk)
    written = skipped = 0
    for key, received, device, app, errors, payload in src.execute(
            "SELECT key, received, device, app, errors, payload FROM uploads ORDER BY key"):
        body = clean_body(payload)
        if body is None or not received:
            skipped += 1
            continue
        created = ms(received)
        dst.execute("INSERT INTO reports (key, device, app, errors, body, created, expires) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (key, device or key.split("_")[1], app or "", errors or 0, body, created, created + REPORT_KEEP_MS))
        written += 1
    print(f"✅ reports: {written} written" + (f", {skipped} skipped (not a JSON report)" if skipped else ""), file=out)
    return {"written": written, "skipped": skipped}


def write_metrics(src, dst, want, out):
    """Old metrics.sqlite3 -> the harvest's tables only, in its shape, in dst.
    Returns {table: rows} written and the columns left out per table."""
    written, dropped, skipped = {}, {}, []
    for (t, sql) in src.execute("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name").fetchall():
        if t == "reports" or (t not in want and not OWN.match(t)):
            skipped.append(t)
            continue
        have = columns(src, t)
        if OWN.match(t):
            dst.execute(sql)
            cols = have
        else:
            spec, pk = want[t]
            create(dst, t, spec, pk)
            cols = [c for c, _ in spec]
            dropped[t] = [c for c in have if c not in cols]
        pick = ", ".join(f'"{c}"' if c in have else "NULL" for c in cols)
        rows = src.execute(f'SELECT {pick} FROM "{t}"').fetchall()
        dst.executemany(f'INSERT INTO "{t}" VALUES ({", ".join("?" * len(cols))})', rows)
        written[t] = len(rows)
    for t, n in written.items():
        print(f"✅ {t}: {n} rows" + (f" (left out: {', '.join(dropped[t])})" if dropped.get(t) else ""), file=out)
    if skipped:
        print(f"⏭️  not the harvest's: {', '.join(skipped)}", file=out)
    return written, dropped


def export(new, logs=None, metrics=None, want=None, out=None):
    """One new file from the old report archive, the old metrics archive, or
    both. `telemetry.py import` starts a job's history once and refuses a job
    that already has a stored snapshot, so both archives go in one file."""
    want, out = want or shape(), out or sys.stdout
    sources = [open_old(p) if p else None for p in (logs, metrics)]
    try:
        dst = open_new(new)
        try:
            if sources[0]:
                write_reports(sources[0], dst, want, out)
            if sources[1]:
                write_metrics(sources[1], dst, want, out)
            dst.commit()
        finally:
            dst.close()
    finally:
        for src in sources:
            if src:
                src.close()


def export_reports(old, new, want=None, out=None):
    export(new, logs=old, want=want, out=out)


def export_metrics(old, new, want=None, out=None):
    export(new, metrics=old, want=want, out=out)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("reports", "metrics"):
        p = sub.add_parser(name)
        p.add_argument("old")
        p.add_argument("out")
    p = sub.add_parser("all")
    p.add_argument("logs")
    p.add_argument("metrics")
    p.add_argument("out")
    sub.add_parser("check").add_argument("file")
    args = ap.parse_args(argv)
    try:
        if args.cmd == "reports":
            export_reports(args.old, args.out)
        elif args.cmd == "metrics":
            export_metrics(args.old, args.out)
        elif args.cmd == "all":
            export(args.out, logs=args.logs, metrics=args.metrics)
        path = args.out if args.cmd != "check" else args.file
        if not Path(path).expanduser().is_file():
            raise Fail(f"no file at {path}")
        bad = problems(Path(path).expanduser())
        for line in bad:
            print(f"❌ {line}")
        if bad:
            return 1
        print(f"✅ {path} is in the harvest's shape: "
              + ", ".join(f"{t} {n}" for t, n in counts(Path(path).expanduser()).items()))
    except Fail as e:
        print(f"🛑 {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
