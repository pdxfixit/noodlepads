// Where a forgotten PIN goes. The address is never written out in a served or tracked file, so a spam harvester that
// reads the page, its scripts or this public repo finds none: it is kept reversed and base64-encoded and built here
// (Ben, 2026-10-16: "consider protecting the email address from scrapers"). tests/no-plain-email.test.mjs holds the line.
const PIN_RESET_ENC = 'bW9jLnNkYXBlbGRvb25AdGVzZXIubmlw';
export const PIN_RESET_EMAIL = atob(PIN_RESET_ENC).split('').reverse().join('');
