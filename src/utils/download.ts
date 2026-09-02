/**
 * Offer a string to the user as a file download.
 *
 * The object URL is revoked on the next task, not synchronously: Safari has
 * been known to abort the download if the URL disappears before the click has
 * been fully dispatched.
 */
export function downloadText(
  filename: string,
  text: string,
  type = 'application/json',
): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
