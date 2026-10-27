// "🔓 What's private (not much)": README's privacy statement, word for word
// (tests/privacy.test.mjs checks that, and ties each claim to the code: the
// Worker, the names, the report expiry). The app no longer shows it: ⚙️
// Settings and Help link the shared privacy policy instead (Ben, 2026-10-16).
// Change it in the same commit as anything that changes what the cloud
// stores or shows (the feedback box too), and docs/privacy-policy.md too
// (the shared policy; tests/privacy.test.mjs keeps the three in step).

export const PRIVACY_TITLE = "🔓 What's private (not much)";

// The full policy, shared by every pdxfixit app. The page links it beside the
// version in Settings → About (not in the footer: Ben, 2026-10-19); README
// links it too.
export const PRIVACY_URL = 'https://privacy.pdxfixit.com/noodlepads/';

export const PRIVACY = [
  'Nobody goes to the cloud by themselves. A grown-up puts someone there: ☁️ In the cloud in their profile, a sum, then a PIN for them.',
  'In the cloud, Cloudflare stores for noodlepads.com: each profile\'s fun name, avatar and color, their sounds, beats, songs, recorded voices and settings, and the names you give them.',
  'Anyone who opens noodlepads.com sees the list of the newest 300 profiles: their fun names, avatars and colors, whether each has a PIN, and when its look last changed.',
  "Anyone who has a sound's link can play it. The links are long and random, but they are not secret.",
  'Anyone with a share code can see and play what was shared, until the sharer taps 🚫 Unshare or their profile is deleted. Remixes others made of it stay theirs. Removing it from Shared with me only takes it off your list.',
  'Everyone in the cloud has a PIN. It is not security: it only stops someone opening or changing a profile in the app.',
  'A device that remembers a profile (🔑 Remember on this device) opens it with no PIN until someone taps Forget this device. Sharing from it still asks the PIN.',
  'The app asks for no real names, emails or accounts. Profile names are made up by the app; nobody types one.',
  "To stop one visitor using up the cloud's new profiles, each network address may add 3 a day. The cloud counts them with a scrambled code made from the address and the date, never the address itself, and forgets the code the next day. The address is never stored, logged or shown.",
  'Everyone else stays on this device only. Remove PIN, or switching ☁️ In the cloud off, deletes their cloud copy and keeps this device\'s. Links they shared stop working.',
  'A song 🎧 From a song listens to is heard only in this browser, as it plays: it is never saved, synced or sent. Only the beats made from it are kept.',
  "While 📊 play data is on, a profile in the cloud also counts when and how often it is opened and synced, with the country, the browser, system and device type, and a scrambled code for each device that opens it. Never an address or city. Kept 14 days, a device's row 90 days, and our own copy up to a year.",
  "Cloudflare, our host, also counts page views, without cookies. It is the only outside site the app talks to.",
  "Problem reports, on unless someone switches them off, send this device's cleaned event log (no sounds and no names), its settings, how many sounds, beats and songs it has, its browser, system and device type (never the full browser string), its screen size, time zone and sound timing, the app's version, and random codes for this device and this visit. They are deleted from the cloud about 14 days later, once the site is next used. Nothing is sent while the 📊 play data switch in ⚙️ Settings is off. A device where nobody chose sends one only after an error or a tap that made no sound. A tap that made no sound adds the screen, what was tapped, how far the tap got, what lay on top of it, an open dialog, the audio's state and how long the page had run.",
  "Feedback is sent only when a grown-up answers a sum and taps Send in ⚙️ Settings → About → Feedback: only what they typed, and the app's version. Only the people who make the app read it, and it is deleted after 90 days. No name or IP address is stored with it.",
  "To delete a profile and everything in it: 👥 People, tap them, tap Delete twice, then ☁️ Delete their cloud copy too twice, or Remove PIN, or switch ☁️ In the cloud off (tap it twice), to keep this device's own copy. Each asks for their PIN. It is gone from the cloud at once, with every share code it made.",
];

// The statement as a list, into `box` (a <ul>).
export function renderPrivacy(box) {
  box.replaceChildren(...PRIVACY.map((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    return li;
  }));
}
