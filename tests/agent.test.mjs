// web/agent.js reads a User-Agent as families for problem reports and for
// the Worker's devices table (worker/metrics.js): one set of rules, and every
// answer is on agent.js's lists.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAgent, BROWSERS, SYSTEMS, TYPES } from '../web/agent.js';
import { parseAgent as workerParse } from '../worker/metrics.js';

const AGENTS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 OPR/114.0',
  'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  'Mozilla/5.0 (Android 14; Tablet; rv:131.0) Gecko/131.0 Firefox/131.0',
  'curl/8.4.0', '', null,
];

test('the Worker reads the User-Agent with web/agent.js itself, not a copy', () => {
  assert.equal(workerParse, parseAgent);
});

test('every family is on the fixed lists a report may send', () => {
  for (const ua of AGENTS) {
    const { browser, os, type } = parseAgent(ua, true);
    assert.ok(BROWSERS.includes(browser), browser);
    assert.ok(SYSTEMS.includes(os), os);
    assert.ok(TYPES.includes(type), type);
  }
  assert.deepEqual(parseAgent(AGENTS[4], true), { browser: 'Samsung', os: 'Android', type: 'tablet' });
});
