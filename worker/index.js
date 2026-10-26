// Noodle Pads' Worker script. Static files are served by Cloudflare before
// this runs; only a path with no file behind it reaches here. It owns /api/:
// problem reports (POST /api/log, worker/reports.js), usage events (POST
// /api/events, flarepress's shared events-worker.js: stored in R2 as sent,
// never parsed, no IP), feedback (POST /api/feedback, the same file's
// handleFeedback: what a grown-up typed in ⚙️ Settings → About → Feedback,
// stored in R2 as sent, never parsed, no IP) and cloud profiles (everything
// else under /api/, worker/cloud.js). Every other path goes to the static
// assets.
//
// Bindings (site/wrangler.toml), and nothing else:
//   ASSETS  the static assets (web/)
//   DB      the D1 database `noodle-pads` (worker/schema.sql)
//   EVENTS  the R2 bucket `noodlepads-telemetry` (usage events; the telemetry runner's job reads it)
//   FEEDBACK          the R2 bucket `app-suggestions`, shared by every app's feedback, ours under v1/noodlepads/
//                     (the telemetry runner's daily pull copies each message to Ben's notes and deletes it)
//   FEEDBACK_LIMITER  a rate limit on POST /api/feedback, counted for the app as a whole, never per sender
//   PUSH_LIMITER, SOUND_LIMITER, SHARE_LIMITER, OPEN_LIMITER, PULL_LIMITER, DOWNLOAD_LIMITER
//                     rate limits on a push, a sound's start or piece, a share, an open, a pull and a download, per profile
//                     once its key is checked (an open: the profile it opens; a download: the sound's owner), never per address (worker/cloud.js LIMITERS)
// One secret: CHECKS_KEY, which the deploy checks send to prove who they are (worker/cloud.js provenCheck);
// the deploy puts it in from the GitHub secret of the same name.

import { handleLog } from './reports.js';
import { handleCloud } from './cloud.js';
import { handleEvents, handleFeedback } from './events-worker.js';
import { ORIGIN } from './http.js';

// Usage events (web/telemetry.js): only from the site itself.
export const EVENTS_OPTS = { bucket: 'EVENTS', origins: [ORIGIN] };
// Feedback (web/feedback.js): only from the site itself, ours under v1/noodlepads/ in the shared bucket.
export const FEEDBACK_OPTS = { bucket: 'FEEDBACK', app: 'noodlepads', origins: [ORIGIN], limiter: 'FEEDBACK_LIMITER' };

export { ORIGIN } from './http.js';
export { MAX_BYTES, TTL_MS, handleLog } from './reports.js';

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/log') return handleLog(request, env);
    if (pathname === '/api/events') return handleEvents(request, env, EVENTS_OPTS);
    if (pathname === '/api/feedback') return handleFeedback(request, env, FEEDBACK_OPTS);
    if (pathname === '/api' || pathname.startsWith('/api/')) return handleCloud(request, env, Date.now(), ctx);
    return env.ASSETS.fetch(request);
  },
};
