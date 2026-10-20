// The release: semver, and PATCH is always the commit count of the commit
// that set it (`just version`, tools/bump_version.py), so every change to
// web/ bumps it. `just version minor` starts a release worth a CHANGELOG.md
// section. The deploy labels version.json from this line (site/site.conf
// release=) as v<release>-<short commit>; the page does not load this file,
// and shows no release number (Ben, 2026-10-19).
export const RELEASE = '1.0.217';
