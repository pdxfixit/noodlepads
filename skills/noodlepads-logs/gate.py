#!/usr/bin/env python3
"""noodlepads-logs gate and state: decide what is due, fast, and record what ran.

  gate.py                      exit 0 nothing due / 10 due / 2 error (one line)
  gate.py attention            print the leg's outstanding attention items
  gate.py done sync|digest --status ok|error [--attention FILE|-] [--newest KEY]
                               record a job's outcome; attention replaces that job's
                               outstanding items (pass none to clear them)

The gate never writes, and reads only two small files: the state, and the
cloud config, ~/.config/noodlepads/cloud.json ($NOODLEPADS_CONFIG). Two jobs:
  sync    due when the last good sync is over 20 hours old (three recurrent runs
          a day sync once)
  digest  due when the last good digest is over 7 days old
Until the config holds real ids (Ben has not made the D1 database yet), nothing
is due: there is nothing to read.

State: ~/.local/state/skills/noodlepads-logs.state.json ($NOODLE_LOGS_STATE).
Repo:  ~/src/noodlepads, else the repo's older folder ($NOODLE_LOGS_REPO).
Stdlib only, Python 3.8+.
"""
import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path

SYNC_EVERY = dt.timedelta(hours=20)
DIGEST_EVERY = dt.timedelta(days=7)
# D1 keeps an upload 30 days; say so well before a gap in syncing loses any.
SYNC_WARN = dt.timedelta(days=3)
JOBS = ("sync", "digest")


def state_path():
    return Path(os.environ.get("NOODLE_LOGS_STATE")
                or "~/.local/state/skills/noodlepads-logs.state.json").expanduser()


def repo_path():
    if os.environ.get("NOODLE_LOGS_REPO"):
        return Path(os.environ["NOODLE_LOGS_REPO"]).expanduser()
    return Path("~/src/noodlepads").expanduser()


def config_path():
    return Path(os.environ.get("NOODLEPADS_CONFIG") or "~/.config/noodlepads/cloud.json").expanduser()


def now():
    return dt.datetime.now().astimezone()


def load_state(path=None):
    path = path or state_path()
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return {"version": 1, "jobs": {}}


def set_up(repo=None):
    """None when the cloud config holds real ids, else why not. A missing repo is an error."""
    repo = repo or repo_path()
    if not repo.is_dir():
        raise RuntimeError(f"no Noodle Pads repo at {repo}")
    cfg_path = config_path()
    if not cfg_path.exists():
        return f"no {cfg_path} (just doctor says how to make it)"
    cfg = json.loads(cfg_path.read_text())
    for field in ("account_id", "database_id"):
        value = str(cfg.get(field) or "")
        if not value or value.startswith("<"):
            return f"{field} not filled in {cfg_path}"
    return None


def age(stamp, t):
    return t - dt.datetime.fromisoformat(stamp) if stamp else None


def human(delta):
    hours = delta.total_seconds() / 3600
    return f"{hours:.0f}h ago" if hours < 48 else f"{hours / 24:.0f}d ago"


def due_jobs(state, t):
    """[(job, reason)] for each job that is due."""
    out = []
    for job, every in (("sync", SYNC_EVERY), ("digest", DIGEST_EVERY)):
        last = state["jobs"].get(job, {}).get("last_success")
        a = age(last, t)
        if a is None:
            out.append((job, "never succeeded"))
        elif a >= every:
            out.append((job, f"last good {job} {human(a)}"))
    return out


def cmd_gate(t=None):
    t = t or now()
    why_not = set_up()
    if why_not:
        print(f"NOTHING-DUE (not set up: {why_not})")
        return 0
    state = load_state()
    due = due_jobs(state, t)
    if not due:
        sync = age(state["jobs"]["sync"]["last_success"], t)
        digest = age(state["jobs"]["digest"]["last_success"], t)
        print(f"NOTHING-DUE (last sync {human(sync)}, last digest {human(digest)})")
        return 0
    print("DUE " + ", ".join(f"{job} ({reason})" for job, reason in due))
    return 10


def attention_lines(state, t, configured=True):
    lines = []
    for job in JOBS:
        lines += [f"{job}: {a}" for a in state["jobs"].get(job, {}).get("attention") or []]
    if configured:
        last = state["jobs"].get("sync", {}).get("last_success")
        a = age(last, t)
        if a is not None and a >= SYNC_WARN:
            lines.append(f"sync: last good sync {human(a)}; D1 deletes uploads after 30 days")
    return lines


def cmd_attention(t=None):
    t = t or now()
    configured = set_up() is None
    for line in attention_lines(load_state(), t, configured):
        print(line)
    return 0


def cmd_done(args, t=None):
    t = (t or now()).isoformat(timespec="seconds")
    path = state_path()
    state = load_state(path)
    js = state["jobs"].setdefault(args.job, {})
    js["last_run"] = t
    js["status"] = args.status
    if args.status == "ok":
        js["last_success"] = t
    if args.newest:
        js["newest"] = args.newest
    text = sys.stdin.read() if args.attention == "-" else (
        Path(args.attention).expanduser().read_text() if args.attention else "")
    js["attention"] = [l.strip() for l in text.splitlines() if l.strip()]
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n")
    os.replace(tmp, path)
    print(f"{args.job}: recorded {args.status}, {len(js['attention'])} attention item(s)")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd")
    d = sub.add_parser("done")
    d.add_argument("job", choices=JOBS)
    d.add_argument("--status", required=True, choices=["ok", "error"])
    d.add_argument("--attention", help="one line per item: a file, or - for stdin")
    d.add_argument("--newest", help="sync: the newest report key now in the archive")
    sub.add_parser("attention")
    args = ap.parse_args(argv)
    try:
        if args.cmd == "done":
            return cmd_done(args)
        if args.cmd == "attention":
            return cmd_attention()
        return cmd_gate()
    except Exception as e:  # a broken gate must say so in one line, never look like "nothing due"
        print(f"gate error: {e}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
