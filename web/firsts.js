// A new person's first steps (ADR 0028): the pure parts the welcome
// (welcome.js) and the one-time tips, hint dots and nudge share. Imports
// nothing, so settings.js and the tests can take it.

// The test hook: `globalThis.noodleFirstSteps = false`, set before the app
// starts, turns every first step off (the welcome, and the tips, dots, 🧸
// hand and level-up nudge that follow it). Only the stand-in page
// (tests/fake-dom.mjs installPage, unless a test asks for them) and `just
// look` (unless a view asks for them) set it, so a fresh device there shows
// the app as before. Nothing in the app sets it, and no person can.
export const firstStepsOn = () => globalThis.noodleFirstSteps !== false;
