// A second reporter for `just test` (tools/node_tests.sh): it writes the
// test files that had a test start whose end was never reported, one path a
// line. --test-force-exit (the app's test files never end by themselves) can
// cut a parallel run's last reports; the spec reporter then prints that test
// as "▶ name", with no file. node_tests.sh reruns each file named here alone
// and takes its exit code, so a cut run can no longer pass unseen.

// Files with a started test that never passed or failed, in the order seen.
export async function* unended(source) {
  const open = new Map();   // file → (nesting and name → starts not yet ended)
  for await (const { type, data } of source) {
    if (!['test:start', 'test:pass', 'test:fail'].includes(type) || !data?.file) continue;
    const key = `${data.nesting}\0${data.name}`;
    if (!open.has(data.file)) open.set(data.file, new Map());
    const tests = open.get(data.file);
    const count = (tests.get(key) ?? 0) + (type === 'test:start' ? 1 : -1);
    // A file that fails as a whole (it never loads) reports a fail with no start.
    if (count > 0) tests.set(key, count); else tests.delete(key);
  }
  for (const [file, tests] of open) if (tests.size) yield `${file}\n`;
}

export default unended;
