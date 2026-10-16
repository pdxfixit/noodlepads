// Noodle Pads' Worker script. Static files are served by Cloudflare before
// this runs; only a path with no file behind it reaches here. It owns /api/:
// problem reports (POST /api/log, worker/reports.js), usage events (POST
// /api/events, flarepress's shared events-worker.js: stored in R2 as sent,
// never parsed, no IP) and cloud profiles (everything else under /api/,
// worker/cloud.js). Every other path goes to the static assets.
//
// Bindings (site/wrangler.toml), and nothing else:
//   ASSETS  the static assets (web/)
//   DB      the D1 database `noodle-pads` (worker/schema.sql)
//   EVENTS  the R2 bucket `noodlepads-telemetry` (usage events; the telemetry runner's job reads it)
// No secrets.

import { handleLog } from './reports.js';
import { handleCloud } from './cloud.js';
import { handleEvents } from './events-worker.js';
import { ORIGIN } from './http.js';

// Usage events (web/telemetry.js): only from the site itself.
export const EVENTS_OPTS = { bucket: 'EVENTS', origins: [ORIGIN] };

export { ORIGIN } from './http.js';
export { MAX_BYTES, TTL_MS, handleLog } from './reports.js';

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/log') return handleLog(request, env);
    if (pathname === '/api/events') return handleEvents(request, env, EVENTS_OPTS);
    if (pathname === '/api' || pathname.startsWith('/api/')) return handleCloud(request, env, Date.now(), ctx);
    return env.ASSETS.fetch(request);
  },
};
