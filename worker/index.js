// Noodle Pads' Worker script. Static files are served by Cloudflare before
// this runs; only a path with no file behind it reaches here. It owns /api/:
// problem reports (POST /api/log, worker/reports.js) and cloud profiles
// (everything else under /api/, worker/cloud.js). Every other path goes to
// the static assets.
//
// Bindings (flarepress noodlepads.com/wrangler.toml), and nothing else:
//   ASSETS  the static assets (web/)
//   DB      the D1 database `noodle-pads` (worker/schema.sql)
// and one secret (`wrangler secret put IP_KEY`, docs/deploy-cloudflare.md):
//   IP_KEY  the key for the IP's hash in the metrics (worker/metrics.js);
//           without it no hash is kept

import { handleLog } from './reports.js';
import { handleCloud } from './cloud.js';

export { ORIGIN } from './http.js';
export { MAX_BYTES, TTL_MS, handleLog } from './reports.js';

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/log') return handleLog(request, env);
    if (pathname === '/api' || pathname.startsWith('/api/')) return handleCloud(request, env, Date.now(), ctx);
    return env.ASSETS.fetch(request);
  },
};
