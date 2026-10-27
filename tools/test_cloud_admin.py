"""tools/cloud_admin.py against a local SQLite database: the same SQL the tool
sends to D1, run on the live schema (tests/schema-before-001.sql) or the
current one (worker/schema.sql)."""

import contextlib
import io
import re
import json
import os
import sqlite3
import tempfile
import unittest
from datetime import timezone
from unittest import mock
from pathlib import Path

import cloud_admin as ca

ROOT = Path(__file__).resolve().parent.parent
DAY = ca.DAY_MS
NOW = 1_800_000_000_000


class Local:
    """cloud_admin's database calls, on SQLite in memory."""

    def __init__(self, schema=None):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        if schema:
            self.db.executescript(schema.read_text())
        self.ran = []

    def query(self, sql):
        return [dict(r) for r in self.db.execute(sql).fetchall()]

    def execute(self, sql):
        self.ran.append(sql)
        self.db.executescript(sql)

    def execute_file(self, path):
        self.ran.append(str(path))
        self.db.executescript(Path(path).read_text())


def quiet():
    lines = []
    return lines, lines.append


def profile(db, pid, created, active, records=0, sound=None):
    db.execute(f"INSERT INTO profiles (id, name, avatar, color, rev, edited, created, active) VALUES ('{pid}', 'Sir Squid', '', '#1F3FA8', 0, {created}, {created}, {active});")
    for i in range(records):
        db.execute(f"INSERT INTO records (profile_id, kind, id, body, rev) VALUES ('{pid}', 'beats', 'b-{i}', '{{}}', 1);")
    if sound:
        db.execute(f"INSERT INTO sounds (id, profile_id, mime, bytes, chunks, sha256, got, created) VALUES ('{sound}', '{pid}', 'audio/wav', 5, 1, 'x', 1, {created});"
                   f"INSERT INTO sound_chunks (sound_id, n, data) VALUES ('{sound}', 0, x'01');"
                   f"INSERT INTO records (profile_id, kind, id, body, sound_id, rev) VALUES ('{pid}', 'clips', 'user-1', '{{}}', '{sound}', 1);")


S1 = 's-' + 'a' * 26
S2 = 's-' + 'b' * 26
S3 = 's-' + 'c' * 26


class Migrate(unittest.TestCase):
    def test_dry_run_lists_then_yes_applies_once(self):
        db = Local(ROOT / 'tests' / 'schema-before-001.sql')
        lines, out = quiet()
        pending = ca.migrate(db, False, out)
        names = [p.name for p in pending]
        self.assertEqual(names[:5], ['001-shares-not-gifts-or-families.sql', '002-player-metrics.sql', '003-visits-no-ip-hash.sql', '004-country-only.sql', '005-drop-uses-visits.sql'])
        self.assertEqual(names, sorted(p.name for p in (ROOT / 'worker' / 'migrations').glob('[0-9][0-9][0-9]-*.sql')), 'every one, in order')
        self.assertEqual(db.ran, [], 'a dry run changes nothing')
        ca.migrate(db, True, out)
        self.assertIn('active', [c['name'] for c in db.query('PRAGMA table_info(profiles)')])
        db.ran.clear()
        self.assertEqual(ca.migrate(db, True, out), [])
        self.assertEqual(db.ran, [], 'nothing runs twice')

    def test_a_fresh_database_from_schema_needs_no_migration(self):
        db = Local(ROOT / 'worker' / 'schema.sql')
        self.assertEqual(ca.migrate(db, True, quiet()[1]), [])

    def test_schema_refuses_a_database_that_has_tables(self):
        with self.assertRaises(ca.Trouble):
            ca.schema(Local(ROOT / 'tests' / 'schema-before-001.sql'), True, quiet()[1])
        empty = Local()
        ca.schema(empty, True, quiet()[1])
        self.assertTrue(ca.has_table(empty, 'shares'))


class DropGuard(unittest.TestCase):
    """A migration that drops a table D1 holds rows of waits for the telemetry
    mirror to hold at least as many (2026-10-16: 005 dropped 77 unharvested rows)."""

    def setUp(self):
        self.db = Local(ROOT / 'worker' / 'schema.sql')
        self.db.execute("DELETE FROM migrations WHERE name = '005-drop-uses-visits';"
                        "CREATE TABLE uses (profile_id TEXT, feature TEXT, day TEXT, n INTEGER);"
                        "CREATE TABLE visits (id INTEGER PRIMARY KEY, at INTEGER);"
                        "INSERT INTO uses VALUES ('p-a', 'pad', '2026-10-14', 3), ('p-a', 'beats', '2026-10-14', 1);"
                        "INSERT INTO visits (at) VALUES (1);")
        self.db.ran.clear()
        self.mirror = sqlite3.connect(':memory:')

    def run_migrate(self, yes, **kw):
        lines, out = quiet()
        try:
            ca.migrate(self.db, yes, out, archive=self.mirror, **kw)
            error = None
        except ca.Trouble as err:
            error = str(err)
        return lines, error

    def test_finds_the_tables_a_migration_drops_and_ignores_comments(self):
        self.assertEqual(ca.dropped_tables(ROOT / 'worker' / 'migrations' / '005-drop-uses-visits.sql'), ['uses', 'visits'])
        self.assertEqual(ca.dropped_tables(ROOT / 'worker' / 'migrations' / '004-country-only.sql'), [], 'a dropped column is not a dropped table')

    def test_rows_the_mirror_lacks_stop_the_migration_before_anything_runs(self):
        lines, error = self.run_migrate(True)
        self.assertIn('rows nothing has copied', error)
        self.assertIn('just pull noodlepads', error)
        self.assertIn('--allow-drop uses --allow-drop visits', error)
        self.assertTrue(any(l.startswith('🛑 uses: D1 holds 2 rows, the telemetry mirror 0.') for l in lines), lines)
        self.assertTrue(any(l.startswith('🛑 visits: D1 holds 1 rows, the telemetry mirror 0.') for l in lines), lines)
        self.assertEqual(self.db.ran, [], 'nothing ran')
        self.assertTrue(ca.has_table(self.db, 'uses'))

    def test_a_dry_run_says_so_and_changes_nothing(self):
        lines, error = self.run_migrate(False)
        self.assertIsNone(error)
        self.assertTrue(any('would stop here' in l for l in lines), lines)
        self.assertEqual(self.db.ran, [])

    def test_a_mirror_with_as_many_rows_lets_it_through(self):
        self.mirror.executescript("CREATE TABLE uses (profile_id, feature, day, n);"
                                  "INSERT INTO uses VALUES ('p-a', 'pad', '2026-10-14', 3), ('p-a', 'beats', '2026-10-14', 1);"
                                  "CREATE TABLE visits (id INTEGER PRIMARY KEY, at INTEGER); INSERT INTO visits (at) VALUES (1);")
        lines, error = self.run_migrate(True)
        self.assertIsNone(error, lines)
        self.assertFalse(ca.has_table(self.db, 'uses'))
        self.assertIn('✅ 005-drop-uses-visits', lines)

    def test_fewer_rows_in_the_mirror_still_stop_it(self):
        self.mirror.executescript("CREATE TABLE uses (profile_id, feature, day, n); INSERT INTO uses VALUES ('p-a', 'pad', '2026-10-14', 3);")
        lines, error = self.run_migrate(True)
        self.assertTrue(any(l.startswith('🛑 uses: D1 holds 2 rows, the telemetry mirror 1.') for l in lines), lines)
        self.assertTrue(any(l.startswith('🛑 visits: D1 holds 1 rows, the telemetry mirror 0.') for l in lines), lines)
        self.assertTrue(error)

    def test_an_empty_table_or_one_that_is_gone_needs_no_copy(self):
        self.db.execute('DELETE FROM uses; DROP TABLE visits;')
        lines, error = self.run_migrate(True)
        self.assertIsNone(error, lines)

    def test_allow_drop_is_the_explicit_way_through_and_per_table(self):
        lines, error = self.run_migrate(True, allow=('uses',))
        self.assertIn('--allow-drop visits', error)
        self.assertNotIn('--allow-drop uses', error)
        lines, error = self.run_migrate(True, allow=('uses', 'visits'))
        self.assertIsNone(error, lines)
        self.assertFalse(ca.has_table(self.db, 'visits'))

    def test_no_mirror_at_all_counts_as_no_rows(self):
        with tempfile.TemporaryDirectory() as home, mock.patch.dict(os.environ, {'TELEMETRY_DB': str(Path(home) / 'nope.sqlite3')}):
            lines, out = quiet()
            with self.assertRaises(ca.Trouble):
                ca.migrate(self.db, True, out)
            self.assertTrue(any(l.startswith('🛑 uses: D1 holds 2 rows, the telemetry mirror 0.') for l in lines), lines)

    def test_the_command_line_takes_allow_drop_once_per_table(self):
        seen = {}
        with mock.patch.object(ca, 'migrate', lambda db, yes, **kw: seen.update(yes=yes, **kw)):
            ca.main(['migrate', '--yes', '--allow-drop', 'uses', '--allow-drop', 'visits'], db=object())
        self.assertEqual(seen, {'yes': True, 'allow': ('uses', 'visits')})


class Prune(unittest.TestCase):
    def setUp(self):
        self.db = Local(ROOT / 'worker' / 'schema.sql')
        profile(self.db, 'p-old', NOW - 400 * DAY, NOW - 200 * DAY, records=2, sound=S1)
        profile(self.db, 'p-busy', NOW - 400 * DAY, NOW - DAY, records=3)
        profile(self.db, 'p-empty', NOW - 10 * DAY, NOW - 10 * DAY)
        profile(self.db, 'p-new', NOW - 1000, NOW - 1000)
        self.db.ran.clear()

    def test_profiles_lists_counts_and_sizes(self):
        rows = {r['id']: r for r in ca.profiles(self.db, quiet()[1])}
        self.assertEqual(rows['p-old']['records'], 3)
        self.assertEqual(rows['p-old']['bytes'], 5)
        self.assertEqual(rows['p-busy']['records'], 3)

    def test_stats_lists_players_not_test_profiles(self):
        lines, out = quiet()
        rows = ca.stats(self.db, now=NOW, out=out, archive=sqlite3.connect(':memory:'))
        self.assertNotIn('p-smoke', ' '.join(r['id'] for r in rows))
        self.assertTrue(lines[0].startswith('player'))
        self.assertTrue(any(re.match(r'^\d+ players · \d+ active in the last 7 days · ', line) for line in lines))
        self.assertEqual(lines[-1], 'No player metrics yet.')

    def test_dry_run_by_default(self):
        plan, _ = ca.prune(self.db, days=180, now=NOW, out=quiet()[1])
        self.assertEqual([p['id'] for p, _ in plan], ['p-old'])
        self.assertEqual(self.db.ran, [])
        self.assertEqual(len(ca.list_profiles(self.db)), 4)

    def test_empty_spares_a_profile_in_its_first_day(self):
        plan, _ = ca.prune(self.db, empty=True, now=NOW, out=quiet()[1])
        self.assertEqual([p['id'] for p, _ in plan], ['p-empty'])

    def test_yes_deletes_everything_of_theirs_shares_too(self):
        # As the Worker's deleteProfile (2026-10-26): a share code can't outlive its
        # profile, since nobody could unshare it then.
        self.db.execute(f"INSERT INTO shares (code, profile_id, kind, title, bundle, hash, created) VALUES ('ABCD2345', 'p-old', 'sound', 'Burp', '{{}}', 'h', 1);"
                        f"INSERT INTO share_sounds (code, sound_id) VALUES ('ABCD2345', '{S1}');")
        ca.prune(self.db, days=180, empty=True, yes=True, now=NOW, out=quiet()[1])
        self.assertEqual(sorted(r['id'] for r in ca.list_profiles(self.db)), ['p-busy', 'p-new'])
        self.assertEqual(self.db.query("SELECT COUNT(*) AS n FROM records WHERE profile_id = 'p-old'")[0]['n'], 0)
        self.assertEqual(self.db.query('SELECT id FROM sounds'), [])
        self.assertEqual(self.db.query('SELECT code FROM shares'), [])
        self.assertEqual(self.db.query('SELECT code FROM share_sounds'), [])

    def test_loose_sounds_go_too(self):
        self.db.execute(f"INSERT INTO sounds (id, profile_id, mime, bytes, chunks, sha256, got, created) VALUES ('{S2}', 'p-busy', 'audio/wav', 9, 1, 'y', 1, {NOW - 2 * DAY}),"
                        f" ('{S3}', 'p-busy', 'audio/wav', 9, 1, 'z', 1, {NOW - 1000});")
        _, loose = ca.prune(self.db, days=10_000, now=NOW, out=quiet()[1])
        self.assertEqual([s['id'] for s in loose], [S2], 'one uploading right now is left alone')
        ca.prune(self.db, days=10_000, yes=True, now=NOW, out=quiet()[1])
        self.assertEqual(sorted(r['id'] for r in self.db.query('SELECT id FROM sounds')), [S1, S3])

    def test_smoke_takes_only_the_deploy_checks_leftovers_and_their_shares(self):
        profile(self.db, 'p-smoke-old', NOW - 3600_000, NOW - 3600_000, records=1)
        profile(self.db, 'p-e2e-running', NOW - 30_000, NOW - 30_000)
        self.db.execute("INSERT INTO shares (code, profile_id, kind, title, bundle, hash, created) VALUES"
                        f" ('SMKE2345', 'p-smoke-gone', 'beat', 'Smoke test', '{{}}', 'h', {NOW - 3600_000}),"
                        f" ('KEEP2345', 'p-old', 'beat', 'Burp', '{{}}', 'h', {NOW - 3600_000});")
        self.db.ran.clear()
        plan, loose = ca.prune(self.db, smoke=True, now=NOW, out=quiet()[1])
        self.assertEqual([p['id'] for p, _ in plan], ['p-smoke-old'], 'one younger than 10 minutes may be running')
        self.assertEqual(loose, [], '--smoke alone touches nothing but test data')
        self.assertEqual(self.db.ran, [])
        ca.prune(self.db, smoke=True, yes=True, now=NOW, out=quiet()[1])
        ids = sorted(r['id'] for r in ca.list_profiles(self.db))
        self.assertEqual(ids, ['p-busy', 'p-e2e-running', 'p-empty', 'p-new', 'p-old'])
        self.assertEqual([r['code'] for r in self.db.query('SELECT code FROM shares')], ['KEEP2345'])

    def test_a_deleted_share_code_gives_its_bytes_back_to_its_profile(self):
        # The security seat, 2026-10-26: shares count in record_bytes (worker/cloud.js
        # SHARE_SIZE), so deleting one here must lower it as unshare does.
        profile(self.db, 'p-e2e-running', NOW - 30_000, NOW - 30_000)
        self.db.execute("UPDATE profiles SET record_bytes = 1000 WHERE id = 'p-e2e-running';"
                        "INSERT INTO shares (code, profile_id, kind, title, bundle, hash, created) VALUES"
                        f" ('RUNS2345', 'p-e2e-running', 'beat', 'Burp', '{{}}', 'h', {NOW - 3600_000});"
                        f"INSERT INTO share_sounds (code, sound_id) VALUES ('RUNS2345', '{S1}');")
        ca.prune(self.db, smoke=True, yes=True, now=NOW, out=quiet()[1])
        self.assertEqual(self.db.query('SELECT code FROM shares'), [])
        cost = len('{}') + len('Burp') + 100 * 2
        self.assertEqual(self.db.query("SELECT record_bytes FROM profiles WHERE id = 'p-e2e-running'"), [{'record_bytes': 1000 - cost}])
        # A database before migration 006 has no record_bytes: nothing to lower.
        self.assertFalse(any('record_bytes' in s for s in ca.delete_share_sql('ABCD2345', counted=False)))

    def test_an_id_that_is_not_an_id_never_reaches_sql(self):
        with self.assertRaises(ca.Trouble):
            ca.delete_profile_sql("p-a'; DROP TABLE profiles; --")


HOUR = 60 * 60 * 1000
PHONE = 'a' * 64
TABLET = 'b' * 64


def event(db, at, pid, kind, device=PHONE, country='US'):
    dev = "'" + device + "'" if device else 'NULL'
    db.execute(f"INSERT INTO activity (at, profile_id, device, kind, country) "
               f"VALUES ({at}, '{pid}', {dev}, '{kind}', '{country}');")


def device(db, h, pid, kind='phone', last=NOW, syncs=3):
    db.execute(f"INSERT INTO devices (hash, profile_id, first_seen, last_seen, syncs, app, browser, os, type, width) "
               f"VALUES ('{h}', '{pid}', {NOW - 5 * DAY}, {last}, {syncs}, '7b5fc5e', 'Safari', 'iOS', '{kind}', 360);")


def fill(db):
    """The same metrics, in D1 (for prune) or in the archive (as the harvest leaves it)."""
    device(db, PHONE, 'p-kid')
    device(db, TABLET, 'p-kid', kind='tablet', last=NOW - DAY, syncs=9)
    device(db, 'c' * 64, 'p-smoke-1')
    event(db, NOW - 2 * DAY, 'p-kid', 'open')
    event(db, NOW - 2 * DAY + HOUR, 'p-kid', 'pull')
    event(db, NOW - DAY, 'p-kid', 'pull', device=TABLET, country='CA')
    event(db, NOW - HOUR, 'p-kid', 'pin-wrong', device=None, country='CA')
    event(db, NOW - HOUR, 'p-smoke-1', 'make', device='c' * 64)


class HarvestKeepsNoNames(unittest.TestCase):
    """The shared privacy policy (2026-10-16): no profile name or avatar leaves D1.
    site/harvest.conf copies only a profile's id and when it was made."""

    def test_the_harvest_copies_only_id_and_created_from_profiles(self):
        lines = [l for l in (ROOT / 'site' / 'harvest.conf').read_text().splitlines() if l.startswith('table=profiles ')]
        self.assertEqual(len(lines), 1)
        cols = re.search(r'\bcols=(\S+)', lines[0]).group(1).split(',')
        self.assertEqual(cols, ['id', 'created'])
        self.assertIn('as=players', lines[0])

    def test_the_harvest_names_no_mac_archive(self):
        # The runner passes --db; a db= line would name the retired metrics.sqlite3.
        conf = (ROOT / 'site' / 'harvest.conf').read_text()
        self.assertFalse([l for l in conf.splitlines() if l.startswith('db=')])
        self.assertNotIn('metrics.sqlite3\n', conf.replace('metrics.sqlite3, is retired', ''))

    def test_the_archive_players_table_has_no_name_or_avatar(self):
        conn = ca.open_archive(':memory:')
        self.assertEqual([r[1] for r in conn.execute('PRAGMA table_info(players)')], ['id', 'created'])


class Metrics(unittest.TestCase):
    """`just cloud-stats`: the players from D1, then the metrics reported per
    player from the harvest's archive (ADR 0016)."""

    def setUp(self):
        self.db = Local(ROOT / 'worker' / 'schema.sql')
        profile(self.db, 'p-kid', NOW - 10 * DAY, NOW)
        profile(self.db, 'p-smoke-1', NOW - DAY, NOW)
        self.db.execute("UPDATE profiles SET avatar = '🐙' WHERE id = 'p-kid';")
        fill(self.db)
        self.archive = ca.open_archive(':memory:')
        fill(self.archive)
        self.archive.execute("INSERT INTO players VALUES ('p-kid', ?)", (NOW - 10 * DAY,))
        self.archive.execute("INSERT INTO harvest_meta VALUES ('last_run', '2027-01-15T07:00:00Z'), ('last_result', 'ok')")

    def stats(self):
        lines, out = quiet()
        ca.stats(self.db, now=NOW, out=out, archive=self.archive, tz=timezone.utc)
        return lines

    def test_names_come_from_the_live_cloud_and_a_gone_player_has_none(self):
        text = '\n'.join(self.stats())
        self.assertIn('Sir Squid  p-kid', text, 'the name D1 has now')
        lines, out = quiet()
        ca.metrics_report(self.archive, NOW, out=out, tz=timezone.utc)
        self.assertTrue(any(l.startswith('(gone)  p-kid') for l in lines), 'no live name: the archive has none to show')

    def test_reports_devices_places_and_activity_and_flags_two_places(self):
        lines = self.stats()
        text = '\n'.join(lines)
        self.assertIn('📦 archive (in memory): last harvested 2027-01-15T07:00:00Z', text)
        head = next(l for l in lines if 'p-kid' in l and '🐙' in l)
        self.assertIn('⚠️ seen from 2 places', head)
        self.assertNotIn('p-smoke', text, 'test profiles are left out')
        self.assertIn('📱 devices: 2', text)
        self.assertRegex(text, r'aaaaaa  phone   Safari   iOS      w360   app 7b5fc5e\s+3 syncs')
        self.assertRegex(text, r'bbbbbb  tablet')
        self.assertIn('     US · 2 events', text)
        self.assertIn('     CA · 2 events', text)
        self.assertNotIn('IP', text, 'nothing of the IP is kept, so none is reported')
        day_line = next(l for l in lines if l.startswith('  📅'))
        self.assertIn('4 events; 3 days with any', day_line)
        hour_line = next(l for l in lines if l.startswith('  🕐'))
        self.assertIn('by hour (UTC)', hour_line)
        self.assertEqual(len(hour_line.split('|')[1]), 24)
        self.assertIn('🔁 pull 2 · open 1 · pin-wrong 1', text)
        self.assertNotIn('🧩', text, 'feature-use counts are retired (ADR 0027)')
        self.assertNotIn('👀', text, 'and so are visits')
        self.assertIn('noodlepads_events__daily_events', text, 'where the app-wide numbers are now')
        self.assertEqual(lines[-1], '1 players with metrics · 1 seen from more than one place')

    def test_one_place_is_not_flagged(self):
        self.archive.execute("DELETE FROM activity WHERE country = 'CA';")
        lines = self.stats()
        self.assertNotIn('⚠️', '\n'.join(lines))
        self.assertEqual(lines[-1], '1 players with metrics · 0 seen from more than one place')

    def test_an_archive_nothing_has_harvested_says_so(self):
        lines, out = quiet()
        ca.stats(self.db, now=NOW, out=out, archive=ca.open_archive(':memory:'), tz=timezone.utc)
        self.assertTrue(any('nothing harvested yet (the telemetry runner harvests' in l for l in lines))
        self.assertEqual(lines[-1], 'No player metrics yet.')

    def test_a_harvest_that_failed_in_part_is_named(self):
        self.archive.execute("UPDATE harvest_meta SET value = '1 failed' WHERE key = 'last_result'")
        self.assertTrue(any('(1 failed)' in l for l in self.stats()))

    def store(self, folder, runs=(('2027-01-15T07:00:00Z', 'ok', 'fine'),)):
        """A telemetry runner's pulled store: this archive's tables as
        noodlepads__<table>, each with the runner's _changed column, and _runs."""
        path = os.path.join(folder, 'telemetry.sqlite3')
        out = sqlite3.connect(path)
        for (t,) in self.archive.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall():
            if t == 'harvest_meta':
                continue
            cols = [r[1] for r in self.archive.execute(f'PRAGMA table_info({t})')]
            out.execute(f'CREATE TABLE "noodlepads__{t}" ({", ".join(cols)}, _changed TEXT)')
            out.executemany(f'INSERT INTO "noodlepads__{t}" VALUES ({", ".join("?" * (len(cols) + 1))})',
                            [tuple(r) + ('2027-01-15',) for r in self.archive.execute(f'SELECT * FROM {t}')])
        out.execute('CREATE TABLE "_runs" (job TEXT, started TEXT, finished TEXT, status TEXT, exit_code INTEGER, '
                    'rows_written INTEGER, message TEXT, _changed TEXT, PRIMARY KEY (job, started))')
        out.executemany("INSERT INTO _runs VALUES ('noodlepads', ?, '', ?, 0, 0, ?, '')", runs)
        out.commit()
        out.close()
        return path

    def test_reports_from_the_runners_pulled_store_without_writing_to_it(self):
        # The telemetry runner is the only harvester (Ben, 2026-10-15): cloud-stats
        # reads its store's noodlepads__ tables, read only.
        with tempfile.TemporaryDirectory() as folder:
            path = self.store(folder)
            before = open(path, 'rb').read()
            lines, out = quiet()
            ca.stats(self.db, now=NOW, out=out, archive=path, tz=timezone.utc)
            text = '\n'.join(lines)
            self.assertIn('📦 telemetry', text)
            self.assertIn('last run 2027-01-15T07:00:00Z, as of your last `telemetry.py pull`', text)
            head = next(l for l in lines if 'p-kid' in l and '🐙' in l)
            self.assertIn('⚠️ seen from 2 places', head)
            self.assertEqual(open(path, 'rb').read(), before, 'the store is never written')

    def test_a_store_names_a_failed_run_and_a_store_with_no_run_yet(self):
        with tempfile.TemporaryDirectory() as folder:
            path = self.store(folder, runs=(('2027-01-15T07:00:00Z', 'unreachable', 'Cloudflare 503'),))
            lines, out = quiet()
            ca.stats(self.db, now=NOW, out=out, archive=path, tz=timezone.utc)
            self.assertTrue(any('(unreachable: Cloudflare 503)' in l for l in lines))
        with tempfile.TemporaryDirectory() as folder:
            path = self.store(folder, runs=())
            lines, out = quiet()
            ca.stats(self.db, now=NOW, out=out, archive=path, tz=timezone.utc)
            self.assertTrue(any('no noodlepads run pulled yet' in l for l in lines))

    def test_the_metrics_come_only_from_the_runners_mirror(self):
        # Ben, 2026-10-16: "the telemetry tooling needs to take this over". The old
        # metrics.sqlite3 is never read, even when it is there or named.
        with tempfile.TemporaryDirectory() as home, mock.patch.dict(os.environ, {'NOODLE_METRICS_DB': 'x', 'TELEMETRY_DB': ''}):
            old = Path(home) / '.local/state/noodlepads/metrics.sqlite3'
            old.parent.mkdir(parents=True)
            ca.open_archive(':memory:').close()
            sqlite3.connect(old).executescript(ca.ARCHIVE_SCHEMA)
            self.assertEqual(ca.default_archive(home), Path(home) / '.local/state/telemetry/telemetry.sqlite3')
            self.assertFalse(hasattr(ca, 'metrics_path'))
            with self.assertRaisesRegex(ca.Trouble, 'no telemetry mirror at .*telemetry.py pull'):
                ca.open_archive(ca.default_archive(home))
            self.assertFalse(ca.default_archive(home).exists(), 'a missing mirror is never created')
            with self.assertRaisesRegex(ca.Trouble, "not the telemetry runner's mirror"):
                ca.open_archive(old)

    def test_pruning_a_profile_deletes_its_metrics_too(self):
        self.db.execute(f"UPDATE profiles SET active = {NOW - 400 * DAY}, created = {NOW - 400 * DAY} WHERE id = 'p-kid';")
        ca.prune(self.db, days=180, yes=True, now=NOW, out=quiet()[1])
        for t in ca.METRICS_TABLES:
            self.assertEqual(self.db.query(f"SELECT COUNT(*) AS n FROM {t} WHERE profile_id = 'p-kid'")[0]['n'], 0, t)
        self.assertEqual(self.db.query("SELECT COUNT(*) AS n FROM activity")[0]['n'], 1, "another profile's stay")

    def test_bars(self):
        self.assertEqual(ca.bars([0, 1, 4, 8]), ' ▁▄█')
        self.assertEqual(ca.bars([]), '')


SHOWN_PIN = re.compile(r'new PIN is (\d{4})\.')


class ResetPin(unittest.TestCase):
    # Ben, 2026-10-26: "reset Captain Cranberries' PIN" from a cold session; 2026-10-27: the tool
    # picks a random PIN for Ben to pass on, never 1234 (the profile list is public).
    def kid(self, db, pid='p-cc', name='Captain Cranberries', active=1):
        db.execute(f"INSERT INTO profiles (id, name, avatar, color, pin_hash, pin_salt, fails, locked_until, rev, edited, created, active) VALUES ('{pid}', '{name}', '', '#1F3FA8', 'h', 's', 4, 99, 0, 1, 1, {active});"
                   f"INSERT INTO keys (hash, profile_id, created) VALUES ('k-{pid}', '{pid}', 1);")

    def reset(self, db, who, draws, **kw):
        """reset_pin with `secrets.randbelow` drawing `draws` in turn; the lines it said."""
        lines, out = quiet()
        with mock.patch.object(ca.secrets, 'randbelow', side_effect=list(draws)) as rb:
            done = ca.reset_pin(db, who, out=out, **kw)
        for call in rb.call_args_list:
            self.assertEqual(call.args, (10_000,), '0000 to 9999, each alike')
        return done, lines

    def stored(self, db, pid='p-cc'):
        return db.query(f"SELECT pin_hash, pin_salt, fails, locked_until FROM profiles WHERE id = '{pid}'")[0]

    def test_asks_then_sets_a_random_pin_and_drops_every_key(self):
        db = Local(ROOT / 'worker' / 'schema.sql')
        self.kid(db)
        self.assertFalse(self.reset(db, 'p-cc', [4821], ask=lambda _: 'no')[0])
        self.assertEqual(self.stored(db)['pin_hash'], 'h')
        done, lines = self.reset(db, 'p-cc', [4821], ask=lambda _: 'yes')
        self.assertTrue(done)
        self.assertEqual(SHOWN_PIN.search(lines[-1]).group(1), '4821')
        row = self.stored(db)
        self.assertEqual(row['pin_hash'], ca.pin_hash('4821', row['pin_salt']))
        self.assertEqual(db.query('SELECT COUNT(*) AS n FROM keys')[0]['n'], 0)

    def test_an_unknown_profile_is_said(self):
        with self.assertRaises(ca.Trouble):
            ca.reset_pin(Local(ROOT / 'worker' / 'schema.sql'), 'p-none', out=quiet()[1])

    def test_sets_a_new_pin_by_fun_name_in_any_case(self):
        db = Local(ROOT / 'worker' / 'schema.sql')
        self.kid(db)
        done, lines = self.reset(db, 'captain cranberries', [4821], yes=True)
        self.assertTrue(done)
        self.assertIn("Captain Cranberries's new PIN is 4821.", lines[-1])
        self.assertIn('Pass it on', lines[-1])
        row = self.stored(db)
        self.assertEqual(row['pin_hash'], ca.pin_hash('4821', row['pin_salt']))
        self.assertEqual(len(row['pin_salt']), 32, '16 random bytes, as the Worker makes')
        self.assertEqual((row['fails'], row['locked_until']), (0, 0), 'no wait left from wrong tries')
        self.assertEqual(db.query('SELECT COUNT(*) AS n FROM keys')[0]['n'], 0, 'every device opens it again')

    def test_a_pin_is_always_four_digits_leading_zeros_too(self):
        db = Local(ROOT / 'worker' / 'schema.sql')
        self.kid(db)
        lines = self.reset(db, 'p-cc', [7], yes=True)[1]
        self.assertEqual(SHOWN_PIN.search(lines[-1]).group(1), '0007')
        row = self.stored(db)
        self.assertEqual(row['pin_hash'], ca.pin_hash('0007', row['pin_salt']), 'the pad types 0007, not 7')

    def test_an_obvious_pin_is_drawn_again(self):
        db = Local(ROOT / 'worker' / 'schema.sql')
        self.kid(db)
        lines = self.reset(db, 'p-cc', [1234, 0, 1111, 4321, 9999, 1212, 2580, 6789, 5739], yes=True)[1]
        self.assertEqual(SHOWN_PIN.search(lines[-1]).group(1), '5739')

    def test_which_pins_are_obvious(self):
        for pin in ('1234', '0000', '1111', '4321', '9999', '0123', '6789', '9876', '3210', '1212', '2580'):
            self.assertTrue(ca.obvious_pin(pin), pin)
        for pin in ('4821', '0007', '1235', '7890', '1357', '5739'):
            self.assertFalse(ca.obvious_pin(pin), pin)
        self.assertLess(sum(ca.obvious_pin(f'{n:04d}') for n in range(10_000)), 50, 'the list stays short')

    def test_a_real_draw_is_four_digits_and_never_obvious(self):
        for _ in range(500):
            pin = ca.new_pin()
            self.assertRegex(pin, r'^\d{4}$')
            self.assertFalse(ca.obvious_pin(pin), pin)

    def test_one_update_sets_the_hash_and_salt_together(self):
        # A clear, then a set, would let a sync between them see the profile with no PIN.
        db = Local(ROOT / 'worker' / 'schema.sql')
        self.kid(db)
        before = len(db.ran)
        self.reset(db, 'p-cc', [4821], yes=True)
        self.assertEqual(len(db.ran), before + 1, 'one call to the database')
        statements = [s.strip() for s in db.ran[-1].split(';') if s.strip()]
        updates = [s for s in statements if s.upper().startswith('UPDATE')]
        self.assertEqual(len(updates), 1, statements)
        self.assertIn('pin_hash = ', updates[0])
        self.assertIn('pin_salt = ', updates[0])
        self.assertNotIn('NULL', db.ran[-1].upper(), 'never a profile left with no PIN')
        self.assertEqual([s for s in statements if s not in updates], ["DELETE FROM keys WHERE profile_id = 'p-cc'"])

    def test_the_pin_is_said_once_on_stdout_and_written_nowhere(self):
        db = Local(ROOT / 'worker' / 'schema.sql')
        self.kid(db)
        stdout, stderr = io.StringIO(), io.StringIO()
        no_file = AssertionError('the PIN is never written to a file')
        with mock.patch.object(ca.secrets, 'randbelow', side_effect=[4821]), \
             mock.patch('builtins.open', side_effect=no_file), mock.patch('io.open', side_effect=no_file), \
             mock.patch('os.open', side_effect=no_file), \
             contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            self.assertEqual(ca.main(['reset-pin', 'p-cc', '--yes'], db=db), 0)
        self.assertEqual(stdout.getvalue().count('4821'), 1, stdout.getvalue())
        self.assertNotIn('4821', stderr.getvalue())
        self.assertFalse(any('4821' in sql for sql in db.ran), 'only its hash goes to the database')
        self.assertNotIn('4821', json.dumps(db.query('SELECT * FROM profiles')))

    def test_a_pin_cannot_be_chosen(self):
        db = Local(ROOT / 'worker' / 'schema.sql')
        self.kid(db)
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            ca.main(['reset-pin', 'p-cc', '--to', '1234', '--yes'], db=db)
        self.assertEqual(self.stored(db)['pin_hash'], 'h')

    def test_from_a_script_it_shows_who_and_stops_without_yes(self):
        db = Local(ROOT / 'worker' / 'schema.sql')
        self.kid(db)
        lines, out = quiet()
        self.assertFalse(ca.reset_pin(db, 'Captain Cranberries', ask=None, out=out))
        self.assertEqual(db.query("SELECT pin_hash FROM profiles")[0]['pin_hash'], 'h')
        self.assertIn('p-cc: Captain Cranberries, has a PIN', lines)
        self.assertIn('run it again with --yes', lines[-1])

    def test_a_near_name_lists_the_close_ones_and_changes_nothing(self):
        db = Local(ROOT / 'worker' / 'schema.sql')
        self.kid(db)
        lines, out = quiet()
        with self.assertRaises(ca.Trouble):
            ca.reset_pin(db, "Captain Cranberry's", yes=True, out=out)
        self.assertTrue(any('p-cc' in line and 'Captain Cranberries' in line for line in lines))
        self.assertEqual(db.query("SELECT pin_hash FROM profiles")[0]['pin_hash'], 'h')

    def test_two_with_one_name_ask_for_the_id(self):
        db = Local(ROOT / 'worker' / 'schema.sql')
        self.kid(db, 'p-cc1')
        self.kid(db, 'p-cc2', active=5)
        lines, out = quiet()
        with self.assertRaises(ca.Trouble):
            ca.reset_pin(db, 'Captain Cranberries', yes=True, out=out)
        self.assertEqual([line.split()[0] for line in lines], ['p-cc2', 'p-cc1'], 'the last active first')
        self.assertTrue(ca.reset_pin(db, 'p-cc1', yes=True, out=quiet()[1]))
        self.assertEqual(db.query("SELECT pin_hash FROM profiles WHERE id = 'p-cc2'")[0]['pin_hash'], 'h')

    def test_a_name_with_sql_in_it_is_refused(self):
        with self.assertRaises(ca.Trouble):
            ca.reset_pin(Local(ROOT / 'worker' / 'schema.sql'), "x'; DROP TABLE profiles; --", yes=True, out=quiet()[1])


class Wrangler(unittest.TestCase):
    def test_a_failure_shows_wranglers_own_error_not_only_justs_line(self):
        # Ben's `just cloud-migrate --yes` said only "recipe `cloud-db` failed":
        # wrangler's reason was on stdout (--json), and only stderr was shown.
        with tempfile.TemporaryDirectory() as d:
            fake = Path(d) / 'just'
            fake.write_text('#!/bin/sh\n'
                            'echo \'{"error": {"text": "A request to the Cloudflare API failed.", '
                            '"notes": [{"text": "duplicate column name: country [code: 7500]"}], "kind": "error"}}\'\n'
                            'echo "error: recipe \\`cloud-db\\` failed with exit code 1" >&2\n'
                            'exit 1\n')
            fake.chmod(0o755)
            with self.assertRaises(ca.Trouble) as e:
                ca.Wrangler(just=str(fake)).execute('SELECT 1')
        said = str(e.exception)
        self.assertIn('A request to the Cloudflare API failed.', said)
        self.assertIn('duplicate column name: country [code: 7500]', said)
        self.assertIn('recipe `cloud-db` failed', said)
        self.assertLess(said.index('duplicate column'), said.index('recipe `cloud-db`'), 'wrangler first, then just')
        self.assertNotIn('"notes"', said, 'the message text, not the raw JSON')

    def test_failure_text_keeps_plain_stdout_and_trims_both(self):
        self.assertEqual(ca.failure_text('Authentication error\n', 'recipe failed\n'), 'Authentication error\nrecipe failed')
        long = ca.failure_text('x' * 5000, '')
        self.assertLessEqual(len(long), ca.FAIL_TEXT_MAX + 2)
        self.assertEqual(ca.failure_text('', ''), '(no output)')

    def test_a_failed_or_strange_answer_is_trouble_not_an_empty_list(self):
        w = ca.Wrangler()
        w._run = lambda args: 'npm warn something\n'
        with self.assertRaises(ca.Trouble):
            w.query('SELECT 1')
        w._run = lambda args: '[{"results": [{"n": 1}], "success": true}]'
        self.assertEqual(w.query('SELECT 1 AS n'), [{'n': 1}])
        w._run = lambda args: '[{"results": [], "success": false}]'
        with self.assertRaises(ca.Trouble):
            w.query('SELECT 1')


if __name__ == '__main__':
    unittest.main()
