/** Trigger a browser download for an in-memory blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke after the browser had a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "photo.PNG" -> "photo" (keeps names like "a.b" sane: strips last ext only). */
export function fileBaseName(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(0, idx) : name;
}
