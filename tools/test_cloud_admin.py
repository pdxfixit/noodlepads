"""tools/cloud_admin.py against a local SQLite database: the same SQL the tool
sends to D1, run on the live schema (tests/schema-before-001.sql) or the
current one (worker/schema.sql)."""

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
        self.assertEqual(names[:4], ['001-shares-not-gifts-or-families.sql', '002-player-metrics.sql', '003-visits-no-ip-hash.sql', '004-country-only.sql'])
        self.assertEqual(names, sorted(p.name for p in (ROOT / 'worker' / 'migrations').glob('[0-9][0-9][0-9]-*.sql')), 'every one, in order')
        self.assertEqual(db.ran, [], 'a dry run changes nothing')
        ca.migrate(db, True, out)
        self.assertIn('active', [c['name'] for c in db.query('PRAGMA table_info(profiles)')])
        db.ran.clear()
        self.assertEqual(ca.migrate(db, True, out), [])
        self.assertEqual(db.ran, [], 'nothing runs twice')

    def test_pending_names_each_waiting_migration_and_fails(self):
        # The deploy's guard: GitHub deploys every push, but migrating is Ben's.
        db = Local(ROOT / 'tests' / 'schema-before-001.sql')
        lines, out = quiet()
        self.assertEqual(len(ca.pending(db, out)), len(list((ROOT / 'worker' / 'migrations').glob('[0-9][0-9][0-9]-*.sql'))))
        self.assertIn('cloud-migrate --yes', lines[-1])
        self.assertEqual(db.ran, [], 'pending changes nothing')
        self.assertEqual(ca.main(['pending'], db=db), 1)
        ca.migrate(db, True, out)
        self.assertEqual(ca.main(['pending'], db=db), 0)

    def test_a_fresh_database_from_schema_needs_no_migration(self):
        db = Local(ROOT / 'worker' / 'schema.sql')
        self.assertEqual(ca.migrate(db, True, quiet()[1]), [])

    def test_schema_refuses_a_database_that_has_tables(self):
        with self.assertRaises(ca.Trouble):
            ca.schema(Local(ROOT / 'tests' / 'schema-before-001.sql'), True, quiet()[1])
        empty = Local()
        ca.schema(empty, True, quiet()[1])
        self.assertTrue(ca.has_table(empty, 'shares'))


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

    def test_yes_deletes_everything_of_theirs_but_keeps_shared_sounds(self):
        self.db.execute(f"INSERT INTO shares (code, profile_id, kind, title, bundle, hash, created) VALUES ('ABCD2345', 'p-old', 'sound', 'Burp', '{{}}', 'h', 1);"
                        f"INSERT INTO share_sounds (code, sound_id) VALUES ('ABCD2345', '{S1}');")
        ca.prune(self.db, days=180, empty=True, yes=True, now=NOW, out=quiet()[1])
        self.assertEqual(sorted(r['id'] for r in ca.list_profiles(self.db)), ['p-busy', 'p-new'])
        self.assertEqual(self.db.query("SELECT COUNT(*) AS n FROM records WHERE profile_id = 'p-old'")[0]['n'], 0)
        self.assertEqual(self.db.query('SELECT id, profile_id FROM sounds'), [{'id': S1, 'profile_id': ''}])

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


def visit(db, at, pid, secs, screens='pads', level='regular', load=None, latency=None, sigs=None):
    errors = sum(json.loads(sigs).values()) if sigs else 0
    db.execute("INSERT INTO visits (at, profile_id, device, app, secs, first, screens, level, load_ms, latency_ms, errors, error_sigs) "
               "VALUES (?, ?, ?, '7b5fc5e', ?, ?, ?, ?, ?, ?, ?, ?)",
               (at, pid, PHONE, secs, screens.split(',')[0], screens, level, load, latency, errors, sigs))


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
    db.execute("INSERT INTO uses (profile_id, feature, day, n) VALUES ('p-kid', 'pad', '2027-01-14', 40), ('p-kid', 'beats', '2027-01-14', 2), ('p-smoke-1', 'pad', '2027-01-14', 1);")


class HarvestKeepsNoNames(unittest.TestCase):
    """The shared privacy policy (2026-10-16): no profile name or avatar leaves D1.
    site/harvest.conf copies only a profile's id and when it was made."""

    def test_the_harvest_copies_only_id_and_created_from_profiles(self):
        lines = [l for l in (ROOT / 'site' / 'harvest.conf').read_text().splitlines() if l.startswith('table=profiles ')]
        self.assertEqual(len(lines), 1)
        cols = re.search(r'\bcols=(\S+)', lines[0]).group(1).split(',')
        self.assertEqual(cols, ['id', 'created'])
        self.assertIn('as=players', lines[0])

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

    def test_a_long_feature_list_wraps_without_splitting_a_name(self):
        names = [f'feature-{i} {i * 7}' for i in range(34)]
        lines = ca.wrapped('  🧩 ', names)
        self.assertGreater(len(lines), 1)
        self.assertTrue(all(len(l) <= 100 for l in lines), lines)
        self.assertTrue(lines[0].startswith('  🧩 feature-0 0 · '))
        self.assertTrue(all(l.startswith('     feature-') for l in lines[1:]))
        self.assertEqual(' · '.join(l.strip().removeprefix('🧩 ') for l in lines).split(' · '), names)
        self.assertEqual(ca.wrapped('  🧩 ', ['pad 40', 'beats 2']), ['  🧩 pad 40 · beats 2'])

    def test_names_come_from_the_live_cloud_and_a_gone_player_has_none(self):
        text = '\n'.join(self.stats())
        self.assertIn('Sir Squid  p-kid', text, 'the name D1 has now')
        lines, out = quiet()
        ca.metrics_report(self.archive, NOW, out=out, tz=timezone.utc)
        self.assertTrue(any(l.startswith('(gone)  p-kid') for l in lines), 'no live name: the archive has none to show')

    def test_reports_devices_places_activity_and_uses_and_flags_two_places(self):
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
        self.assertIn('🧩 pad 40 · beats 2', text)
        self.assertNotIn('👀', text, 'no visits, no visits line')
        self.assertEqual(lines[-1], '1 players with metrics · 1 seen from more than one place')

    def test_visits_and_their_errors_are_reported(self):
        visit(self.archive, NOW - DAY, 'p-kid', 120, 'pads,beats', load=900, latency=20, sigs='{"app.js:9": 2}')
        visit(self.archive, NOW - HOUR, 'p-kid', 60, 'kids', level='kids', load=700)
        visit(self.archive, NOW - 2 * HOUR, 'p-kid', 30, 'pads', sigs='{"app.js:9": 1, "storage": 1}')
        visit(self.archive, NOW - HOUR, 'p-smoke-1', 5, 'pads', sigs='{"smoke.js:1": 9}')
        text = '\n'.join(self.stats())
        self.assertIn('👀 3 visits · 4 min in all · median 60 s · loads in 900 ms · sound delay 20 ms · 2 with errors', text)
        self.assertIn('screens: pads 2 · beats 1 · kids 1', text)
        self.assertIn('levels: regular 2 · kids 1', text)
        self.assertIn('🐞 errors in visits: smoke.js:1 9 · app.js:9 3 · storage 1', text)

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

    def test_the_default_is_the_pulled_store_when_it_is_there(self):
        with tempfile.TemporaryDirectory() as home, mock.patch.dict(os.environ, {'NOODLE_METRICS_DB': '', 'TELEMETRY_DB': ''}):
            self.assertEqual(ca.default_archive(home).name, 'metrics.sqlite3')
            store = ca.telemetry_path(home)
            store.parent.mkdir(parents=True)
            store.write_bytes(b'')
            self.assertEqual(ca.default_archive(home), store)

    def test_the_archive_lives_beside_the_report_archive_unless_told(self):
        with tempfile.TemporaryDirectory() as home:
            self.assertEqual(ca.metrics_path(home).name, 'metrics.sqlite3')
            self.assertEqual(ca.metrics_path(home).parent.name, 'noodlepads')

    def test_pruning_a_profile_deletes_its_metrics_too(self):
        self.db.execute(f"UPDATE profiles SET active = {NOW - 400 * DAY}, created = {NOW - 400 * DAY} WHERE id = 'p-kid';")
        ca.prune(self.db, days=180, yes=True, now=NOW, out=quiet()[1])
        for t in ca.METRICS_TABLES:
            self.assertEqual(self.db.query(f"SELECT COUNT(*) AS n FROM {t} WHERE profile_id = 'p-kid'")[0]['n'], 0, t)
        self.assertEqual(self.db.query("SELECT COUNT(*) AS n FROM activity")[0]['n'], 1, "another profile's stay")

    def test_bars(self):
        self.assertEqual(ca.bars([0, 1, 4, 8]), ' ▁▄█')
        self.assertEqual(ca.bars([]), '')


class ResetPin(unittest.TestCase):
    def test_asks_then_clears_the_pin_and_every_key(self):
        db = Local(ROOT / 'worker' / 'schema.sql')
        db.execute("INSERT INTO profiles (id, name, avatar, color, pin_hash, pin_salt, fails, rev, edited, created) VALUES ('p-k', 'Sir Squid', '', '#1F3FA8', 'h', 's', 3, 0, 1, 1);"
                   "INSERT INTO keys (hash, profile_id, created) VALUES ('k1', 'p-k', 1);")
        self.assertFalse(ca.reset_pin(db, 'p-k', ask=lambda _: 'no', out=quiet()[1]))
        self.assertEqual(db.query("SELECT pin_hash FROM profiles")[0]['pin_hash'], 'h')
        self.assertTrue(ca.reset_pin(db, 'p-k', ask=lambda _: 'yes', out=quiet()[1]))
        self.assertEqual(db.query("SELECT pin_hash, fails FROM profiles"), [{'pin_hash': None, 'fails': 0}])
        self.assertEqual(db.query('SELECT COUNT(*) AS n FROM keys')[0]['n'], 0)

    def test_an_unknown_profile_is_said(self):
        with self.assertRaises(ca.Trouble):
            ca.reset_pin(Local(ROOT / 'worker' / 'schema.sql'), 'p-none', out=quiet()[1])


class Wrangler(unittest.TestCase):
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
