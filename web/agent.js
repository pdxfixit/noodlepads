// A User-Agent read as families: the browser, OS and device type, and nothing
// else. Problem reports (log-send.js, log-clean.js) send only these, never the
// raw string. Imports nothing, so the app and the Worker both run it:
// worker/metrics.js reads its devices table's families with it too.

export const BROWSERS = ['Edge', 'Samsung', 'Opera', 'Firefox', 'Chrome', 'Safari', 'Other'];
export const SYSTEMS = ['iOS', 'Android', 'ChromeOS', 'Windows', 'macOS', 'Linux', 'Other'];
export const TYPES = ['phone', 'tablet', 'desktop'];

// `touch`: the device has a touch screen (an iPad asks for the desktop site
// and says "Macintosh").
export function parseAgent(ua, touch = false) {
  const s = typeof ua === 'string' ? ua.slice(0, 512) : '';
  const has = (re) => re.test(s);
  const browser = has(/Edg(e|A|iOS)?\//) ? 'Edge'
    : has(/SamsungBrowser\//) ? 'Samsung'
      : has(/OPR\/|OPT\/|Opera/) ? 'Opera'
        : has(/Firefox\/|FxiOS\//) ? 'Firefox'
          : has(/Chrome\/|CriOS\/|Chromium\//) ? 'Chrome'
            : has(/Safari\//) && has(/Version\//) ? 'Safari'
              : 'Other';
  const ipad = has(/iPad/) || (has(/Macintosh/) && touch);
  const os = has(/iPhone|iPod/) || ipad ? 'iOS'
    : has(/Android/) ? 'Android'
      : has(/CrOS/) ? 'ChromeOS'
        : has(/Windows/) ? 'Windows'
          : has(/Macintosh|Mac OS X/) ? 'macOS'
            : has(/Linux/) ? 'Linux'
              : 'Other';
  const type = ipad || (os === 'Android' && !has(/Mobile/)) || has(/Tablet/) ? 'tablet'
    : has(/iPhone|iPod/) || (os === 'Android' && has(/Mobile/)) || has(/Mobi/) ? 'phone'
      : 'desktop';
  return { browser, os, type };
}
