# 0026. Usage events in the shared telemetry standard, on by default, with a switch

- **Status:** Accepted (the visible switch waits for Ben's OK on its mockup)
- **Date:** 2026-10-16
- **Decided by:** Ben, 2026-10-16: one telemetry standard across every app (Arrow-Rama backlog #151, pdxfixit/telemetry `docs/standard.md`); "telemetry on by default with a user switch to turn it off", and off sends nothing, ever. Open: whether players who never use the cloud send events (question #425). Rows in [decisions.md](../decisions.md) (Hosting and data).

**In short.** `web/telemetry.js` has one call, `track(event, details)`, that hands a checked event to flarepress's shared client, which builds the standard's record and sends batches to `/api/events`, stored in R2. `web/track-page.js` calls it from one hook per category: lifecycle, screens, dialogs, every control (one click listener), content (beats, songs, takes), settings (from and to), errors and speed. The `sendUsage` setting, on by default, gates it, and the older metrics (ADR 0016) too.

## Context

- Each app logged usage its own way; none could say which controls are used, in which layout, or in what order ([standard](https://github.com/pdxfixit/telemetry/blob/main/docs/standard.md) §2).
- Noodle Pads' metrics had no off switch, and rode only on cloud calls.

## Decision

- **One record shape:** app `noodlepads`, platform `web`, form (phone, tablet or desktop from the screen and touch), version, player, session (a page load), seq, at, tz, event, screen, details. Details keys are fixed per event (`EVENTS`); values are numbers, booleans or short strings the app wrote.
- **The player** is a plain random id in localStorage `telemetry-player`: not a profile id, never hashed or rotated here, made in one function (`newPlayer`) so #150's rules change one place.
- **Controls are named without a kid's words:** a control from `index.html` by its first label, any other by its id, a `data-` attribute's name or its class. Pads, keys and pills are play, not controls, and are left out. No coordinates: `layout` says which arrangement showed it.
- **The switch.** `sendUsage` (device, default on). Off: `track` does nothing and its queue is emptied; no feature-use counts or visits are kept and what waited goes; cloud calls carry no `X-Noodle-App`, and the Worker keeps no device, event, count or visit for a call without it.
- **Sending** is flarepress's shared web transport, vendored: `web/events-client.js` batches records to `POST /api/events`, and `worker/events-worker.js` stores each batch in the R2 bucket `noodlepads-telemetry` as sent (never parsed, no IP); the telemetry runner's job reads it. The client keeps and sends only while `shouldSend` says so: the switch on, and someone on the device in the cloud unless `SEND_WITHOUT_CLOUD` (question #425, one flag). Events from before version.json arrives wait in `telemetry.js` and go in, in order, once the client starts.

## Options turned down

- **A button component that logs:** the app has none; one delegated listener covers every control already.
- **Naming controls by their label everywhere:** a label can hold a sound's or person's name.
- **Logging tap positions:** a fixed control's place is in the code; one that moves moves with `layout`.

## Consequences

- A new button, dialog or setting is tracked with no code of its own.
- The older metrics (ADR 0016) keep flowing beside the events until the events are seen live; then they can go.
- Revisit when Ben answers #425, or if a control's name needs more than its label, id or class.
