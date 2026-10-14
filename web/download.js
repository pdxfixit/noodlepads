// Hands a Blob to the user as a file download (a backup, a beat file)
// through a temporary link. Needs a page; nothing here runs until it is called.

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  // Give the download time to start before the link is let go. unref keeps a
  // test run (where this is Node's timer) from waiting for it.
  const timer = setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  timer?.unref?.();
}
