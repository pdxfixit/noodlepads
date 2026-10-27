// "🔓 What's private (not much)": README's privacy statement, word for word
// (tests/privacy.test.mjs checks that, and ties each claim to the code: the
// Worker, the names, the report expiry). The app no longer shows it: ⚙️
// Settings and Help link the shared privacy policy instead (Ben, 2026-10-16).
// Change it in the same commit as anything that changes what the cloud
// stores or shows (the feedback box too), and tell the policy
// (pdxfixit/privacy) too.

export const PRIVACY_TITLE = "🔓 What's private (not much)";

// The full policy, shared by every pdxfixit app. The page links it beside the
// version in Settings → About (not in the footer: Ben, 2026-10-19); README
// links it too.
export const PRIVACY_URL = 'https://privacy.pdxfixit.com/noodlepads/';

export const PRIVACY = [
  'Everyone on this device goes to the cloud once they make something, unless their ☁️ In the cloud is switched off.',
  'In the cloud, Cloudflare stores for noodlepads.com: each profile\'s fun name, avatar and color, their sounds, beats, songs and settings, and the names you give them.',
  'Anyone who opens noodlepads.com sees the list of the newest 300 profiles: their fun names, avatars and colors, whether each has a PIN, and when its look last changed.',
  "Anyone who has a sound's link can play it. The links are long and random, but they are not secret.",
  'Anyone with a share code can see and play what was shared, until the sharer taps 🚫 Unshare or their profile is deleted. Remixes others made of it stay theirs. Removing it from Shared with me only takes it off your list.',
  'A PIN is not security. It only stops someone opening or changing a profile in the app.',
  'A device that remembers a profile (🔑 Remember on this device) opens it with no PIN until someone taps Forget this device. Sharing from it still asks the PIN.',
  'The app asks for no real names, emails or accounts. Profile names are made up by the app; nobody types one.',
  'People with ☁️ In the cloud switched off stay on this device only.',
  'A song 🎧 From a song listens to is heard only in this browser, as it plays: it is never saved, synced or sent. Only the beats made from it are kept.',
  "Problem reports, on unless someone switches them off, send this device's cleaned event log (no sounds and no names), its settings, how many sounds, beats and songs it has, its browser, system and device type (never the full browser string), its screen size, time zone and sound timing, the app's version, and random codes for this device and this visit. They are deleted from the cloud about 14 days later, once the site is next used. Nothing is sent while the 📊 play data switch in ⚙️ Settings is off. A device where nobody chose sends one only after an error or a tap that made no sound. A tap that made no sound adds the screen, what was tapped, how far the tap got, what lay on top of it, an open dialog, the audio's state and how long the page had run.",
  "Feedback is sent only when a grown-up answers a sum and taps Send in ⚙️ Settings → About → Feedback: only what they typed, and the app's version. Only the people who make the app read it, and it is deleted after 90 days. No name or IP address is stored with it.",
  "To delete a profile and everything in it: 👥 People, tap them, tap Delete twice, then ☁️ Delete their cloud copy too twice, or switch ☁️ In the cloud off (tap it twice) to keep this device's own copy. Either asks for its PIN if it has one. It is gone from the cloud at once, with every share code it made.",
];

// The statement as a list, into `box` (a <ul>).
export function renderPrivacy(box) {
  box.replaceChildren(...PRIVACY.map((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    return li;
  }));
}
