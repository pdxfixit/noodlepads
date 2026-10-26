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
  'Anyone who opens noodlepads.com sees the list of profiles (fun names and avatars only). Everyone in the cloud is in that list.',
  "Anyone who has a sound's link can play it. The links are long and random, but they are not secret.",
  'Anyone with a share code can see and play what was shared, until the sharer taps 🚫 Unshare or their profile is deleted. Remixes others made of it stay theirs. Removing it from Shared with me only takes it off your list.',
  'A PIN is not security. It only stops someone opening or changing a profile in the app.',
  'The app asks for no real names, emails or accounts. Profile names are made up by the app; nobody types one.',
  'People with ☁️ In the cloud switched off stay on this device only.',
  'A song 🎧 From a song listens to is heard only in this browser, as it plays: it is never saved, synced or sent. Only the beats made from it are kept.',
  "Problem reports, if you turn them on, send this device's cleaned event log (no sounds and no names), its settings, how many sounds, beats and songs it has, its browser, system and device type (never the full browser string), its screen size, time zone and sound timing, and a random code for this device. They are deleted from the cloud after 14 days.",
  "Feedback is sent only when a grown-up answers a sum and taps Send in ⚙️ Settings → About → Feedback: only what they typed, and the app's version. Only the people who make the app read it, and it is deleted after 90 days. No name or IP address is stored with it.",
  "To delete a profile and everything in it: 👥 People, tap them, then tap Delete three times (the third deletes the cloud copy), or switch ☁️ In the cloud off (tap it twice) to keep this device's own copy. Either asks for its PIN if it has one. It is gone from the cloud at once, with every share code it made.",
];

// The statement as a list, into `box` (a <ul>).
export function renderPrivacy(box) {
  box.replaceChildren(...PRIVACY.map((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    return li;
  }));
}
