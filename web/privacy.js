// "🔓 What's private (not much)": the one copy of the app's privacy
// statement. ⚙️ Settings shows it, Help shows it, and README carries the same
// lines (tests/privacy.test.mjs checks all three, and ties the claims to the
// code: the Worker, the names, the report expiry). Change it in the same
// commit as anything that changes what the cloud stores or shows.

export const PRIVACY_TITLE = "🔓 What's private (not much)";

export const PRIVACY = [
  'Everyone on this device goes to the cloud once they make something, unless they are set 📴 Offline (this device only).',
  'In the cloud, Cloudflare stores for noodlepads.com: each profile\'s fun name, avatar and color, their sounds, beats, songs and settings, and the names you give them.',
  'Anyone who opens noodlepads.com sees the list of profiles (fun names and avatars only). Everyone in the cloud is in that list.',
  "Anyone who has a sound's link can play it. The links are long and random, but they are not secret.",
  'Anyone with a share code can see and play what was shared, even after its profile is deleted, until the sharer taps 🚫 Unshare. Remixes others made of it stay theirs. Removing it from Shared with me only takes it off your list.',
  'A PIN is not security. It only stops someone opening or changing a profile in the app.',
  'The app collects no real names, emails or accounts. Profile names are made up by the app; nobody types one.',
  "To see how the app is used, the cloud also keeps for 90 days: each device's type, browser and app version; when and how often each profile is opened and synced; how often each part of the app is used (counts only); and where each visit came from: the city, region, country and internet provider, with a scrambled code made from the internet address. The address itself is not kept.",
  'People set 📴 Offline stay on this device only.',
  "Problem reports, if you turn them on, send this device's cleaned event log: no sounds and no names. They are deleted from the cloud after 30 days.",
  'To delete a profile and everything in it: 👥 People, tap them, ☁️ Cloud, then 📴 Offline (this device only), and its PIN if it has one. It is gone from the cloud at once, except what it shared; this device keeps its own copy.',
];

// The statement as a list, into `box` (a <ul>).
export function renderPrivacy(box) {
  box.replaceChildren(...PRIVACY.map((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    return li;
  }));
}
