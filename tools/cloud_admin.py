#!/usr/bin/env python3
"""Grown-up chores on the cloud database (D1 `noodle-pads`), for the justfile.

    cloud_admin.py schema   [--yes]              a NEW, empty database: worker/schema.sql
    cloud_admin.py migrate  [--yes] [--allow-drop TABLE]   apply worker/migrations/*.sql not yet applied; refuses a
                                                 DROP TABLE of rows the telemetry mirror has fewer of
    cloud_admin.py profiles                      every profile: id, name, made, last active, records, sound bytes
    cloud_admin.py prune    [--days N] [--empty] [--smoke] [--yes]   profiles idle N days (default 180) or empty, and loose sounds;
                                                 --smoke: what the deploy checks left (p-smoke-…, p-e2e-…, and their shares)
    cloud_admin.py reset-pin WHO [--yes]         a forgotten PIN: WHO is the fun name or the id; gives it a new
                                                 random PIN, shown once for Ben to pass on (docs/how-to.md
                                                 "Reset a forgotten PIN")
    cloud_admin.py stats    [--days N]           the players: what each made; then reports the metrics
                                                 (ADR 0016) from the telemetry runner's pulled store
                                                 (read only): devices, places, activity by day and hour

Everything that changes the database shows what it would do and stops,
unless --yes is given (reset-pin asks instead, when typed at a terminal). Every statement runs through
`just cloud-db execute noodle-pads --remote` (flarepress's tools/wrangler.sh:
the Keychain on Ben's Mac, the repo's read-only token on GitHub); nothing
here holds a credential. A read that fails stops the tool: an empty answer is
never taken for "nothing there".

The metrics come only from the telemetry runner's mirror (Ben, 2026-10-16:
"i want consistent local storage mirror of this data"): the runner
(pdxfixit/telemetry) harvests D1 with flarepress's tools/harvest.py
(site/harvest.conf says what), and `telemetry.py pull` copies its store to
~/.local/state/telemetry/telemetry.sqlite3 (or $TELEMETRY_DB), which keeps no
id past a year. D1 keeps events 14 days and a device's row 90. The feature-use
counts and visits ADR 0016 once kept are retired (ADR 0027): the app-wide
numbers are the shared events, `noodlepads_events__daily_events` in the mirror. The older Mac archive, metrics.sqlite3, is retired: docs/how-to.md
"Retire the old Mac archives" moves it into the runner.

Stdlib only. The tests (tools/test_cloud_admin.py) run every command against
a local SQLite database with the same schema.
"""

import argparse
import hashlib
import json
import os
import re
import secrets
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
import cloud_config  # noqa: E402
SCHEMA = ROOT / 'worker' / 'schema.sql'
MIGRATIONS = ROOT / 'worker' / 'migrations'
DAY_MS = 24 * 60 * 60 * 1000

PROFILE_ID = re.compile(r'^[a-z0-9][a-z0-9-]{0,63}$')
SOUND_ID = re.compile(r'^s-[a-z2-7]{26}$')
SHARE_CODE = re.compile(r'^[A-HJ-NP-Z2-9]{8}$')
# The deploy checks' throwaway profiles (tools/look-cloud.mjs: just cloud-smoke,
# just cloud-e2e). A check runs in under a minute; one younger than this may
# be running now, so it is left alone.
TEST_PREFIXES = ('p-smoke-', 'p-e2e-')
TEST_GRACE_MS = 10 * 60 * 1000
MIGRATION_FILE = re.compile(r'^\d{3}-[a-z0-9-]+\.sql$')

# A sound no share uses, on the table `sounds` (as worker/cloud.js UNSHARED).
UNSHARED = 'NOT EXISTS (SELECT 1 FROM share_sounds WHERE share_sounds.sound_id = sounds.id)'


class Trouble(Exception):
    """Something the grown-up must see; the tool stops."""


FAIL_TEXT_MAX = 1500   # each stream's share of a failure message


def failure_text(stdout, stderr):
    """Why a `just cloud-db` call failed, in words: wrangler's own error first
    (under --json it writes it to stdout, as {"error": {"text", "notes"}}), then
    stderr, where `just` always adds its "recipe failed" line. Showing stderr
    alone hid the reason (2026-10-16)."""
    def trim(s):
        s = (s or '').strip()
        return s if len(s) <= FAIL_TEXT_MAX else s[:FAIL_TEXT_MAX] + ' …'
    out = (stdout or '').strip()
    start = out.find('{')
    if start >= 0:
        try:
            doc = json.loads(out[start:])
        except json.JSONDecodeError:
            doc = None
        err = doc.get('error') if isinstance(doc, dict) else None
        if isinstance(err, dict) and err.get('text'):
            notes = [n.get('text') for n in err.get('notes') or [] if isinstance(n, dict) and n.get('text')]
            out = '\n'.join([str(err['text']), *map(str, notes)])
    return '\n'.join(p for p in (trim(out), trim(stderr)) if p) or '(no output)'


class Wrangler:
    """Runs SQL on the live database through `just cloud-db`."""

    def __init__(self, just='just'):
        self.just = just

    def _run(self, args):
        cmd = [self.just, '--justfile', str(ROOT / 'justfile'), 'cloud-db', 'execute', 'noodle-pads', '--remote', '--yes', *args]
        done = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        if done.returncode != 0:
            raise Trouble(f'wrangler failed ({done.returncode}):\n{failure_text(done.stdout, done.stderr)}')
        return done.stdout

    def query(self, sql):
        out = self._run(['--json', '--command', sql])
        start = out.find('[')
        try:
            results = json.loads(out[start:]) if start >= 0 else None
        except json.JSONDecodeError as err:
            raise Trouble(f'wrangler answered something that is not JSON ({err}):\n{out[:400]}') from err
        if not isinstance(results, list) or not results or not results[0].get('success', False):
            raise Trouble(f'the query did not succeed:\n{out[:400]}')
        return results[-1].get('results', [])

    def execute(self, sql):
        self._run(['--command', sql])

    def execute_file(self, path):
        self._run(['--file', str(path)])


def quoted(value, pattern):
    """An id checked against `pattern`, as an SQL string (D1 --command takes no parameters)."""
    if not isinstance(value, str) or not pattern.match(value):
        raise Trouble(f'not an id: {value!r}')
    return f"'{value}'"


def when(ms):
    if not ms:
        return '—'
    return datetime.fromtimestamp(ms / 1000, timezone.utc).strftime('%Y-%m-%d')


def size(n):
    n = n or 0
    for unit in ('B', 'KB', 'MB'):
        if n < 1024 or unit == 'MB':
            return f'{n:.0f} {unit}' if unit == 'B' else f'{n:.1f} {unit}'
        n /= 1024
    return f'{n} MB'


def has_table(db, name):
    rows = db.query(f"SELECT name FROM sqlite_master WHERE type = 'table' AND name = '{name}'")
    return any(r.get('name') == name for r in rows)


def has_column(db, table, column):
    return any(r.get('name') == column for r in db.query(f'PRAGMA table_info({table})'))


# ── schema and migrations ──

def schema(db, yes, out=print):
    """Only for a new, empty database: on the live one it would mark every
    migration applied without making their changes."""
    if has_table(db, 'profiles'):
        raise Trouble('this database already has tables. Use `just cloud-migrate` to bring it up to date, never cloud-schema.')
    if not yes:
        out(f'Would apply {SCHEMA.relative_to(ROOT)} to the empty database. Run again with --yes.')
        return
    db.execute_file(SCHEMA)
    out('✅ schema applied')


def migration_files():
    return sorted(p for p in MIGRATIONS.iterdir() if MIGRATION_FILE.match(p.name))


def applied(db):
    if not has_table(db, 'migrations'):
        return set()
    return {r['name'] for r in db.query('SELECT name FROM migrations')}


# A migration that drops a table. Lines that are comments don't count.
DROP_TABLE = re.compile(r'^\s*DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?[`"\[]?(\w+)', re.IGNORECASE | re.MULTILINE)


def dropped_tables(path):
    """The tables a migration file drops, in order."""
    text = '\n'.join(re.sub(r'--.*$', '', line) for line in Path(path).read_text().splitlines())
    return DROP_TABLE.findall(text)


def unharvested(db, pending, archive=None, allow=()):
    """[(table, rows in D1, rows in the telemetry mirror)] for each table a
    pending migration drops that D1 holds rows of and the mirror holds fewer
    of, except those named in `allow`. A drop cannot be undone, and D1 keeps
    only 14 days of metrics: the mirror is the other copy (ADR 0016). On
    2026-10-16 migration 005 dropped `uses` and `visits` before any harvest had
    copied them, and 77 rows were lost. At least as many rows is the test, not
    proof that every row was copied. `archive`: a path or an open connection
    (default: the runner's pulled store); no mirror counts as no rows."""
    tables = [t for p in pending for t in dropped_tables(p) if t not in allow]
    short = []
    conn = None
    for t in dict.fromkeys(tables):
        if not has_table(db, t):
            continue
        held = db.query(f'SELECT COUNT(*) AS n FROM "{t}"')[0]['n']
        if not held:
            continue
        if conn is None:
            try:
                conn = archive if isinstance(archive, sqlite3.Connection) else open_archive(archive)
            except Trouble:
                conn = False   # no mirror yet
        try:
            copied = conn.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0] if conn else 0
        except sqlite3.Error:
            copied = 0   # the mirror has no such table
        if copied < held:
            short.append((t, held, copied))
    return short


def migrate(db, yes, out=print, archive=None, allow=()):
    if not has_table(db, 'profiles'):
        raise Trouble('this database has no tables yet: use `just cloud-schema` for a new one.')
    done = applied(db)
    pending = [p for p in migration_files() if p.stem not in done]
    if not pending:
        out('✅ up to date: every migration is applied')
        return []
    for p in pending:
        out(f'{"Applying" if yes else "Would apply"} {p.relative_to(ROOT)}')
    short = unharvested(db, pending, archive, allow)
    for t, held, copied in short:
        out(f'🛑 {t}: D1 holds {held} rows, the telemetry mirror {copied}. A migration here drops it.')
    if short:
        names = ' '.join(f'--allow-drop {t}' for t, _, _ in short)
        message = ('a migration would drop rows nothing has copied: harvest and bring them home first '
                   '(`cd ~/src/telemetry && just pull noodlepads`), then run this again. '
                   f'To drop them anyway, say so: {names}')
        if yes:
            raise Trouble(message)
        out(f'Run again with --yes would stop here: {message}')
        return pending
    if not yes:
        out('Run again with --yes to apply them, in this order.')
        return pending
    for p in pending:
        db.execute_file(p)
        if p.stem not in applied(db):
            raise Trouble(f'{p.name} ran, but it is not recorded in `migrations`. Stopped; look before going on.')
        out(f'✅ {p.stem}')
    return pending


# ── profiles ──

PROFILES_SQL = """SELECT p.id, p.name, p.avatar, p.created, p.active, p.rev, (p.pin_hash IS NOT NULL) AS pin,
  (SELECT COUNT(*) FROM records r WHERE r.profile_id = p.id AND r.deleted = 0) AS records,
  (SELECT COALESCE(SUM(s.bytes), 0) FROM sounds s WHERE s.profile_id = p.id) AS bytes,
  (SELECT COUNT(*) FROM keys k WHERE k.profile_id = p.id) AS keys,
  (SELECT COUNT(*) FROM shares x WHERE x.profile_id = p.id) AS shares
FROM profiles p ORDER BY p.active DESC, p.created DESC"""


def list_profiles(db):
    return db.query(PROFILES_SQL)


def last_active(p):
    return max(p.get('active') or 0, p.get('created') or 0)


def table(rows, out=print):
    out(f'{"id":<28} {"name":<18} {"made":<10} {"active":<10} {"records":>7} {"sounds":>9} {"keys":>4} {"shares":>6}')
    for p in rows:
        name = f"{p.get('avatar') or ''} {p['name']}".strip()
        out(f"{p['id']:<28} {name:<18} {when(p['created']):<10} {when(last_active(p)):<10} "
            f"{p['records']:>7} {size(p['bytes']):>9} {p['keys']:>4} {p['shares']:>6}"
            # The Worker serves and lists only profiles with a PIN (docs/design/cloud-needs-pin.md): one with
            # none, made by hand in D1, is unreachable, and Ben deletes it.
            f"{'' if p['pin'] else '  🔓 no PIN'}")


def profiles(db, out=print):
    rows = list_profiles(db)
    table(rows, out)
    total = sum(p['bytes'] or 0 for p in rows)
    out(f'{len(rows)} profiles, {size(total)} of sound in profiles')
    return rows


# ── stats: who plays, and what they have made ──

# One emoji per kind, as the app shows them (web/model.js KIND_EMOJI).
STAT_KINDS = [('clips', '🔊'), ('beats', '🥁'), ('songbook', '🎼'), ('takes', '🎬'), ('voices', '⭐'), ('layouts', '⌨️')]

STATS_SQL = """SELECT p.id, p.name, p.avatar, p.created, p.active, (p.pin_hash IS NOT NULL) AS pin,
  (SELECT COUNT(*) FROM keys k WHERE k.profile_id = p.id) AS devices,
  (SELECT COALESCE(SUM(s.bytes), 0) FROM sounds s WHERE s.profile_id = p.id) AS bytes,
  (SELECT COUNT(*) FROM shares x WHERE x.profile_id = p.id) AS shares
FROM profiles p ORDER BY p.active DESC, p.created DESC"""
KIND_SQL = "SELECT profile_id, kind, COUNT(*) AS n FROM records GROUP BY profile_id, kind"


def stats(db, now=None, out=print, archive=None, days=14, tz=None):
    """The players in the cloud (not the deploy checks' test profiles): what
    each has made, how much sound, PIN, devices and shares; then totals. Then
    the metrics (ADR 0016), reported from the archive (`archive`: a path or
    an open connection; default default_archive(): the telemetry runner's
    pulled store)."""
    now = now or int(time.time() * 1000)
    rows = [r for r in db.query(STATS_SQL) if not is_test(r['id'])]
    counts = {}
    for r in db.query(KIND_SQL):
        counts.setdefault(r['profile_id'], {})[r['kind']] = r['n']
    kinds = ' '.join(f'{e:>4}' for _, e in STAT_KINDS)
    out(f'{"player":<22} {"made":<10} {"active":<10} {kinds} {"sound":>8} {"PIN":>3} {"devices":>7} {"shares":>6}')
    week = 0
    for r in rows:
        c = counts.get(r['id'], {})
        name = f"{r.get('avatar') or ''} {r['name']}".strip()
        made = ' '.join(f'{c.get(k, 0):>4}' for k, _ in STAT_KINDS)
        active = last_active(r)
        week += now - active < 7 * 86_400_000
        out(f"{name:<22} {when(r['created']):<10} {when(active):<10} {made} {size(r['bytes']):>8} "
            f"{'yes' if r['pin'] else 'no':>3} {r['devices']:>7} {r['shares']:>6}")
    total = sum(r['bytes'] or 0 for r in rows)
    out(f'{len(rows)} players · {week} active in the last 7 days · {size(total)} of sound')
    if isinstance(archive, sqlite3.Connection):
        conn = archive
        conn.executescript(ARCHIVE_SCHEMA)
    else:
        conn = open_archive(archive)   # the schema, or the store's read-only views
    out('')
    out(harvest_line(conn, archive_name(archive)))
    # Names come from the live cloud only: the harvest keeps no names (site/harvest.conf).
    names = {r['id']: f"{r.get('avatar') or ''} {r['name']}".strip() for r in rows}
    metrics_report(conn, now, out, days=days, tz=tz, names=names)
    return rows


# ── metrics: the local archive (ADR 0016) ──

# The tables as flarepress's harvest makes them (D1's columns), so a report runs
# on an archive nothing has filled yet. activity's ip_hash is from before
# 2026-10-15: the archive never drops a column, and it was always empty.
ARCHIVE_SCHEMA = """
CREATE TABLE IF NOT EXISTS players (     -- each profile's id and when it was made; never its name or avatar
  id TEXT PRIMARY KEY, created INTEGER
);
CREATE TABLE IF NOT EXISTS devices (     -- as D1's devices (worker/schema.sql), the latest copy wins
  hash TEXT PRIMARY KEY, profile_id TEXT, first_seen INTEGER, last_seen INTEGER, syncs INTEGER,
  app TEXT, browser TEXT, os TEXT, type TEXT, width INTEGER
);
CREATE TABLE IF NOT EXISTS activity (    -- as D1's activity, by its never-reused id
  id INTEGER PRIMARY KEY, at INTEGER, profile_id TEXT, device TEXT, kind TEXT,
  city TEXT, region TEXT, country TEXT, network TEXT, asn INTEGER, ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS activity_profile ON activity (profile_id, at);
CREATE TABLE IF NOT EXISTS harvest_meta (key TEXT PRIMARY KEY, value TEXT);   -- last_run, last_result (flarepress)
"""
DEVICE_COLUMNS = ('hash', 'profile_id', 'first_seen', 'last_seen', 'syncs', 'app', 'browser', 'os', 'type', 'width')
# The country is the only place reported (Ben, 2026-10-16: country only); the
# archive's older rows keep their city and network columns, unread.
ACTIVITY_COLUMNS = ('id', 'at', 'profile_id', 'device', 'kind', 'country')


# The telemetry runner (pdxfixit/telemetry) is the only harvester since
# 2026-10-15; `telemetry.py pull` copies its store to this Mac, with this
# site's tables as noodlepads__<table> and a `_runs` log of every run.
TELEMETRY_JOB = 'noodlepads'


def telemetry_path(home=None):
    return Path(os.environ.get('TELEMETRY_DB') or Path(home or Path.home()) / '.local/state/telemetry/telemetry.sqlite3').expanduser()


def default_archive(home=None):
    """The runner's pulled store, the only place the metrics are read from."""
    return telemetry_path(home)


def archive_name(archive):
    if isinstance(archive, sqlite3.Connection):
        return '(in memory)'
    return str(archive or default_archive()).replace(str(Path.home()), '~')


def is_store(path):
    """A telemetry runner's store: it has a `_runs` table."""
    try:
        conn = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
        try:
            return bool(conn.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_runs'").fetchone())
        finally:
            conn.close()
    except sqlite3.Error:
        return False


def open_store(path):
    """The runner's store, read only: each noodlepads__<table> shows as <table>
    (a temporary view), so the report reads it like the older archive; a table
    no run has written yet is an empty temporary one. Nothing is written to it."""
    conn = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
    prefix = TELEMETRY_JOB + '__'
    for (name,) in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall():
        local = name[len(prefix):] if name.startswith(prefix) else ''
        if re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', local):
            conn.execute(f'CREATE TEMP VIEW "{local}" AS SELECT * FROM main."{name}"')
    temp = re.sub(r'CREATE INDEX[^;]*;', '', ARCHIVE_SCHEMA).replace('CREATE TABLE IF NOT EXISTS', 'CREATE TEMP TABLE IF NOT EXISTS')
    conn.executescript(temp)
    return conn


def open_archive(path=None):
    """The runner's pulled store, read only. ':memory:' is an empty one with the
    harvest's tables (the tests). Anything else is refused, never created."""
    if str(path) == ':memory:':
        conn = sqlite3.connect(':memory:')
        conn.executescript(ARCHIVE_SCHEMA)
        return conn
    path = Path(path or default_archive())
    if not path.exists():
        raise Trouble(f'no telemetry mirror at {path}: run `python3 ~/src/telemetry/telemetry.py pull` first')
    if not is_store(path):
        raise Trouble(f'{path} is not the telemetry runner\'s mirror (it has no _runs table)')
    return open_store(path)


def harvest_line(conn, name):
    """When the harvest last filled the archive, and how it went: from the
    runner's `_runs` log in its store, else the older archive's harvest_meta."""
    if conn.execute("SELECT 1 FROM main.sqlite_master WHERE type = 'table' AND name = '_runs'").fetchone():
        run = conn.execute('SELECT started, status, message FROM main."_runs" WHERE job = ? ORDER BY started DESC LIMIT 1',
                           (TELEMETRY_JOB,)).fetchone()
        if not run:
            return f'⚠️ telemetry {name}: no {TELEMETRY_JOB} run pulled yet (`telemetry.py pull`)'
        started, status, message = run
        return (f'📦 telemetry {name}: last run {started}' + ('' if status == 'ok' else f' ({status}: {message})')
                + ', as of your last `telemetry.py pull`')
    got = dict(conn.execute('SELECT key, value FROM harvest_meta'))
    if 'last_run' not in got:
        return f'⚠️ archive {name}: nothing harvested yet (the telemetry runner harvests; `telemetry.py pull` reads it)'
    result = got.get('last_result', '?')
    return f"📦 archive {name}: last harvested {got['last_run']}" + ('' if result == 'ok' else f' ({result})')


BARS = ' ▁▂▃▄▅▆▇█'


def bars(values):
    """One character a value, ' ' for none, up to █ for the biggest."""
    top = max(values) if values else 0
    return ''.join(BARS[0] if not v else BARS[max(1, round(v / top * 8))] for v in values)


def place_of(a):
    return a['country'] or 'unknown country'


def metrics_report(conn, now, out=print, days=14, tz=None, names=None):
    """Per player (test profiles left out), newest activity first: devices,
    places (the country), activity by day and by hour
    of the day (this Mac's time, or `tz`) and what each event was. A player seen
    from more than one place is flagged ⚠️. Returns
    {profile_id: number of places}. `names`: {profile_id: shown name}, from
    the live cloud; a player no longer there shows as (gone)."""
    tz = tz or datetime.now().astimezone().tzinfo

    def q(sql, *a):
        return conn.execute(sql, a).fetchall()

    names = names or {}
    ids = [r[0] for r in q('SELECT profile_id FROM activity GROUP BY profile_id ORDER BY MAX(at) DESC')]
    ids += [r[0] for r in q('SELECT DISTINCT profile_id FROM devices') if r[0] not in ids]
    ids = [i for i in ids if not is_test(i)]
    if not ids:
        out('No player metrics yet.')
        return {}
    places_of = {}
    zone = datetime.now(tz).strftime('%Z') or 'local'
    for pid in ids:
        acts = [dict(zip(ACTIVITY_COLUMNS, r)) for r in q(f'SELECT {", ".join(ACTIVITY_COLUMNS)} FROM activity WHERE profile_id = ? ORDER BY at', pid)]
        places = {}
        for a in acts:
            p = places.setdefault(place_of(a), {'events': 0, 'last': 0})
            p['events'] += 1
            p['last'] = max(p['last'], a['at'])
        places_of[pid] = len(places)
        flag = f'  ⚠️ seen from {len(places)} places' if len(places) > 1 else ''
        out(f"{names.get(pid, '(gone)')}  {pid}{flag}")
        devs = [dict(zip(DEVICE_COLUMNS, r)) for r in q(f'SELECT {", ".join(DEVICE_COLUMNS)} FROM devices WHERE profile_id = ? ORDER BY last_seen DESC', pid)]
        out(f'  📱 devices: {len(devs)}')
        for d in devs:
            width = f"w{d['width']}" if d['width'] else 'w?'
            out(f"     {d['hash'][:6]}  {d['type'] or '?':<7} {d['browser'] or '?':<8} {d['os'] or '?':<8} {width:<6} "
                f"app {d['app'] or '?':<14} {d['syncs'] or 0:>5} syncs  {when(d['first_seen'])} → {when(d['last_seen'])}")
        out(f'  📍 places: {len(places)}')
        for name, p in sorted(places.items(), key=lambda kv: -kv[1]['events']):
            out(f"     {name} · {p['events']} events · last {when(p['last'])}")
        if acts:
            by_day, hours, kinds = {}, [0] * 24, {}
            for a in acts:
                t = datetime.fromtimestamp(a['at'] / 1000, tz)
                by_day[t.date()] = by_day.get(t.date(), 0) + 1
                hours[t.hour] += 1
                kinds[a['kind']] = kinds.get(a['kind'], 0) + 1
            today = datetime.fromtimestamp(now / 1000, tz).date()
            span = [today - timedelta(days=i) for i in range(days - 1, -1, -1)]
            out(f"  📅 last {days} days |{bars([by_day.get(d, 0) for d in span])}| {span[0]:%m-%d} → {span[-1]:%m-%d}: "
                f"{sum(by_day.get(d, 0) for d in span)} events; {len(by_day)} days with any")
            out(f'  🕐 by hour ({zone}) |{bars(hours)}| 0 → 23')
            out('  🔁 ' + ' · '.join(f'{k} {n}' for k, n in sorted(kinds.items(), key=lambda kv: (-kv[1], kv[0]))))
        out('')
    many = sum(1 for n in places_of.values() if n > 1)
    out('Screens, controls, dialogs, errors and speed for every player: noodlepads_events__daily_events (the shared events, ADR 0026).')
    out(f'{len(ids)} players with metrics · {many} seen from more than one place')
    return places_of


# ── prune ──

def prune_plan(rows, now, days=None, empty=False):
    """The profiles to delete: idle `days` days, and (with `empty`) those with
    no records, made over a day ago (so one in its first sync is safe)."""
    out = []
    for p in rows:
        why = []
        if days is not None and last_active(p) < now - days * DAY_MS:
            why.append(f'idle since {when(last_active(p))}')
        if empty and p['records'] == 0 and (p['created'] or 0) < now - DAY_MS:
            why.append('empty')
        if why:
            out.append((p, ', '.join(why)))
    return out


def is_test(pid):
    return isinstance(pid, str) and pid.startswith(TEST_PREFIXES)


def smoke_plan(rows, now):
    """The deploy checks' profiles a killed run left, over TEST_GRACE_MS old."""
    return [(p, 'test data (cloud-smoke / cloud-e2e)') for p in rows
            if is_test(p['id']) and (p['created'] or 0) < now - TEST_GRACE_MS]


def smoke_shares(db, now):
    """Share codes the checks left: a share made before 2026-10-26 outlived
    its profile, and a killed check's profile goes with its shares."""
    like = ' OR '.join(f"profile_id LIKE '{prefix}%'" for prefix in TEST_PREFIXES)
    return db.query(f'SELECT code, profile_id FROM shares WHERE ({like}) AND created < {int(now - TEST_GRACE_MS)}')


# What a share costs its profile's record_bytes (as worker/cloud.js SHARE_SIZE).
SHARE_SIZE = ('LENGTH(CAST(shares.bundle AS BLOB)) + LENGTH(CAST(shares.title AS BLOB))'
              ' + 100 * (1 + (SELECT COUNT(*) FROM share_sounds WHERE share_sounds.code = shares.code))')


def delete_share_sql(code, counted=True):
    """Deleting a share code, as worker/cloud.js unshare does: its profile's
    record_bytes goes down by what it cost (`counted`: the database has that
    column, migration 006)."""
    q = quoted(code, SHARE_CODE)
    lower = [f'UPDATE profiles SET record_bytes = MAX(0, record_bytes - (SELECT {SHARE_SIZE} FROM shares WHERE code = {q}))'
             f' WHERE id = (SELECT profile_id FROM shares WHERE code = {q})'] if counted else []
    return lower + [f'DELETE FROM share_sounds WHERE code = {q}', f'DELETE FROM shares WHERE code = {q}']


def loose_sounds(db, now):
    """Sounds no live record and no share uses, over a day old: a preview whose
    share was never made, or an upload cut off before its record."""
    return db.query(f"""SELECT id, profile_id, bytes FROM sounds
      WHERE NOT EXISTS (SELECT 1 FROM records WHERE records.sound_id = sounds.id AND records.deleted = 0)
      AND {UNSHARED} AND created < {int(now - DAY_MS)}""")


METRICS_TABLES = ('activity', 'devices')


def delete_profile_sql(pid, metrics=METRICS_TABLES):
    """Deleting a profile, as worker/cloud.js deleteProfile does: its share
    codes and every sound of its own go (a share names only its sharer's
    sounds; a remix holds its own copy); its metrics go too (`metrics`: the
    metrics tables the database has)."""
    q = quoted(pid, PROFILE_ID)
    return [f'DELETE FROM {t} WHERE profile_id = {q}' for t in metrics] + [
        f'DELETE FROM share_sounds WHERE code IN (SELECT code FROM shares WHERE profile_id = {q})',
        f'DELETE FROM shares WHERE profile_id = {q}',
        f'DELETE FROM sound_chunks WHERE sound_id IN (SELECT id FROM sounds WHERE profile_id = {q})',
        f'DELETE FROM sounds WHERE profile_id = {q}',
        f'DELETE FROM records WHERE profile_id = {q}',
        f'DELETE FROM keys WHERE profile_id = {q}',
        f'DELETE FROM profiles WHERE id = {q}',
    ]


def delete_sound_sql(sid):
    q = quoted(sid, SOUND_ID)
    return [f'DELETE FROM sound_chunks WHERE sound_id = {q}', f'DELETE FROM sounds WHERE id = {q}']


def prune(db, days=None, empty=False, yes=False, now=None, out=print, smoke=False):
    """--smoke alone touches only the checks' test data; with --days or
    --empty it is added to theirs."""
    now = now if now is not None else time.time() * 1000
    only_smoke = smoke and days is None and not empty
    if days is None and not empty and not smoke:
        days = 180
    rows = list_profiles(db)
    plan = [] if only_smoke else prune_plan(rows, now, days, empty)
    if smoke:
        planned = {p['id'] for p, _ in plan}
        plan += [(p, why) for p, why in smoke_plan(rows, now) if p['id'] not in planned]
    loose = [] if only_smoke else loose_sounds(db, now)
    shares = smoke_shares(db, now) if smoke else []
    if not plan and not loose and not shares:
        out('Nothing to prune.')
        return plan, loose
    if shares:
        out(f'{"Deleting" if yes else "Would delete"} {len(shares)} share codes the deploy checks made.')
    if plan:
        out(f'{"Deleting" if yes else "Would delete"} {len(plan)} profiles:')
        table([p for p, _ in plan], out)
        for p, why in plan:
            out(f"  {p['id']}: {why}")
    if loose:
        out(f'{"Deleting" if yes else "Would delete"} {len(loose)} loose sounds ({size(sum(s["bytes"] for s in loose))}), used by nothing.')
    if not yes:
        out('Nothing deleted. Run again with --yes to delete these.')
        return plan, loose
    metrics = [t for t in METRICS_TABLES if has_table(db, t)] if plan else []
    statements = ([s for p, _ in plan for s in delete_profile_sql(p['id'], metrics)] + [s for x in loose for s in delete_sound_sql(x['id'])]
                  + [s for x in shares for s in delete_share_sql(x['code'], has_column(db, 'profiles', 'record_bytes'))])
    for i in range(0, len(statements), 60):
        db.execute(';\n'.join(statements[i:i + 60]) + ';')
    left = {r['id'] for r in list_profiles(db)} & {p['id'] for p, _ in plan}
    if left:
        raise Trouble(f'these are still there after the delete: {sorted(left)}')
    out(f'✅ deleted {len(plan)} profiles and {len(loose)} loose sounds' + (f' and {len(shares)} test share codes' if shares else ''))
    return plan, loose


# ── a forgotten PIN ──

PIN_ROUNDS = 20_000   # worker/pin.js ROUNDS
FUN_NAME = re.compile(r"^[A-Za-z][A-Za-z' -]{0,39}$")


def pin_hash(pin, salt_hex, rounds=PIN_ROUNDS):
    """The Worker's PIN hash (worker/pin.js hashSecret): PBKDF2-SHA-256 over the PIN's
    UTF-8, the salt's bytes, 32 bytes out, as hex. tests/pin-hash-python.test.mjs checks the two agree."""
    return hashlib.pbkdf2_hmac('sha256', pin.encode(), bytes.fromhex(salt_hex), rounds).hex()


def find_profile(db, who, out=print):
    """The one profile `who` names: its id, or its fun name in any case ("captain cranberries").
    No exact match lists near ones (each word without its possessive or plural) and stops; two
    profiles with that name are listed with their ids, to pick one."""
    cols = 'id, name, avatar, active, pin_hash IS NOT NULL AS pin'
    if PROFILE_ID.match(who):
        rows = db.query(f'SELECT {cols} FROM profiles WHERE id = {quoted(who, PROFILE_ID)}')
        if rows:
            return rows[0]
    if not FUN_NAME.match(who):
        raise Trouble(f'no profile {who!r}. `just cloud-profiles` lists them.')
    name = who.strip().lower().replace("'", "''")
    rows = db.query(f"SELECT {cols} FROM profiles WHERE lower(name) = '{name}' ORDER BY active DESC")
    if len(rows) == 1:
        return rows[0]
    if not rows:
        # "Cranberry's" finds "Cranberries": a possessive, then a plural or a y, come off each word.
        words = [re.sub(r'(ies|es|s|y)$', '', re.sub(r"'s?$", '', w)) for w in name.replace("''", "'").split()]
        like = ' AND '.join(f"lower(name) LIKE '%{w.replace(chr(39), chr(39) * 2)}%'" for w in words if w)
        rows = db.query(f'SELECT {cols} FROM profiles WHERE {like} ORDER BY active DESC LIMIT 10') if like else []
        if not rows:
            raise Trouble(f'no profile is called {who!r}. `just cloud-profiles` lists them.')
        msg = f'no profile is called exactly {who!r}. Close ones:'
    else:
        msg = f'{len(rows)} profiles are called {who!r}: give the id of the one you mean.'
    for r in rows:
        out(f"  {r['id']}  {r['name']}  (last active {when(r['active'])}{', has a PIN' if r['pin'] else ''})")
    raise Trouble(msg)


# PINs anyone would try first, on top of four of one digit and straight runs
# (obvious_pin). A reset never picks one (Ben, 2026-10-27). The list is the
# Worker's and the app's too, so it is read from web/codes.js, not repeated here.
def _obvious_list():
    src = (ROOT / 'web' / 'codes.js').read_text()
    listed = re.search(r"export const OBVIOUS_PINS = \[([^\]]*)\]", src)
    pins = re.findall(r"'(\d{4})'", listed.group(1)) if listed else []
    if not pins:
        raise SystemExit('web/codes.js lost its OBVIOUS_PINS list: the reset tool reads it')
    return frozenset(pins)


OBVIOUS_PINS = _obvious_list()


def obvious_pin(pin):
    """Four of one digit (0000), a straight run up or down (1234, 4321), or a common pick (2580)."""
    d = [int(c) for c in pin]
    steps = {b - a for a, b in zip(d, d[1:])}
    return (len(steps) == 1 and steps <= {-1, 0, 1}) or pin in OBVIOUS_PINS


def new_pin():
    """A random 4-digit PIN, each of 0000 to 9999 alike (`secrets`), never an obvious one."""
    while True:
        pin = f'{secrets.randbelow(10_000):04d}'
        if not obvious_pin(pin):
            return pin


def reset_pin(db, who, yes=False, ask=input, out=print):
    """Gives a profile a new random PIN, from Ben's ask after a forgotten-PIN email. Never 1234 or
    another PIN everyone knows (Ben, 2026-10-27): the profile list is public. The PIN is shown once,
    in the last line, for Ben to pass on; only its hash and salt reach the database, and nothing
    writes it anywhere else. Every key goes, so each device asks for the new PIN once."""
    p = find_profile(db, who, out)
    q = quoted(p['id'], PROFILE_ID)
    out(f"{p['id']}: {(p.get('avatar') or '') + ' ' if p.get('avatar') else ''}{p['name']}, {'has a PIN' if p['pin'] else 'has no PIN'}")
    doing = f"Give {p['name']} a new random PIN"
    if not yes:
        if ask is None:
            out(f'{doing}? Nothing changed: run it again with --yes.')
            return False
        if ask(f'{doing}? Every device must open it again. Type yes: ').strip().lower() != 'yes':
            out('Nothing changed.')
            return False
    pin = new_pin()
    salt = secrets.token_hex(16)
    h = pin_hash(pin, salt)
    # One UPDATE sets the hash and salt together: a clear, then a set, would let a sync
    # between them see the profile with no PIN, which the Worker treats as not there.
    # Both wrong-try counters (opening, and requests that carry a key) start again.
    db.execute(f"UPDATE profiles SET pin_hash = '{h}', pin_salt = '{salt}', fails = 0, locked_until = 0, key_fails = 0, key_locked_until = 0, strikes = 0, key_strikes = 0 WHERE id = {q}; DELETE FROM keys WHERE profile_id = {q};")
    after = db.query(f'SELECT pin_hash FROM profiles WHERE id = {q}')
    if not after or after[0]['pin_hash'] != h:
        raise Trouble('the PIN did not change: check with `just cloud-profiles`.')
    out(f"✅ {p['name']}'s new PIN is {pin}. Pass it on to the family: it is shown only this once. Each device asks for it once.")
    return True


def main(argv=None, db=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('schema').add_argument('--yes', action='store_true')
    mg = sub.add_parser('migrate')
    mg.add_argument('--yes', action='store_true')
    mg.add_argument('--allow-drop', action='append', default=[], metavar='TABLE',
                    help='drop this table although D1 holds rows the telemetry mirror lacks (cannot be undone)')
    sub.add_parser('profiles')
    st = sub.add_parser('stats')
    st.add_argument('--days', type=int, default=14, help='days in the activity strip (default 14)')
    pr = sub.add_parser('prune')
    pr.add_argument('--days', type=int)
    pr.add_argument('--empty', action='store_true')
    pr.add_argument('--smoke', action='store_true', help='the deploy checks\' leftovers: p-smoke-…, p-e2e-… and their share codes')
    pr.add_argument('--yes', action='store_true')
    rp = sub.add_parser('reset-pin')
    rp.add_argument('who', help='the fun name ("Captain Cranberries") or the profile id')
    rp.add_argument('--yes', action='store_true')
    args = ap.parse_args(argv)
    db = db or Wrangler()
    try:
        if args.cmd == 'schema':
            schema(db, args.yes)
        elif args.cmd == 'migrate':
            migrate(db, args.yes, allow=tuple(args.allow_drop))
        elif args.cmd == 'profiles':
            profiles(db)
        elif args.cmd == 'stats':
            stats(db, days=max(1, args.days))
        elif args.cmd == 'prune':
            if args.days is not None and args.days < 1:
                raise Trouble('--days must be 1 or more')
            prune(db, args.days, args.empty, args.yes, smoke=args.smoke)
        elif args.cmd == 'reset-pin':
            # Typed at a terminal it asks; from a script or an agent it shows who and stops until --yes.
            reset_pin(db, args.who, args.yes, ask=input if sys.stdin.isatty() else None)
    except Trouble as err:
        print(f'🛑 {err}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
