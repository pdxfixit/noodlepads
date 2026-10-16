// The usage switch, as the modules that count and send usage read it: the
// `sendUsage` setting (settings.js), on unless someone turns it off (Ben,
// 2026-10-16: "telemetry on by default with a user switch to turn it off";
// off means nothing is sent, ever). app.js keeps it in step with the setting.
// It imports nothing, so device-meta.js, which the Worker imports too, can
// read it without pulling in the page.

let on = true;

export const usageOn = () => on;
export function setUsage(value) { on = value !== false; }
