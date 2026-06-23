/** Build a friendly, filesystem-safe filename from a caption or the photo date. */
export function buildFilename(caption: string | undefined, createdAt: string | undefined): string {
  let base = (caption || "").trim();
  if (!base && createdAt) {
    const d = new Date(createdAt);
    if (!isNaN(d.getTime())) base = d.toISOString().slice(0, 10); // YYYY-MM-DD
  }
  if (!base) base = "foto";
  // Lowercase, replace umlauts, strip anything not safe.
  base = base
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "foto";
  return `klara-${base}.jpg`;
}

/**
 * Download an image to the device. Fetches the (presigned) URL as a blob and
 * triggers a real `download`, so the file lands in Downloads instead of just
 * opening in a new tab. Falls back to opening the URL if the fetch is blocked.
 */
export async function downloadImage(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke after a tick so the click has consumed the URL.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    // Last resort: open in a new tab so the user can save manually.
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
