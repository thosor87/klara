async function fileToResizedBlob(file: File, maxEdge: number, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob returned null"))),
      "image/jpeg",
      quality
    )
  );
}

export async function makeWebAndThumb(file: File): Promise<{ web: Blob; thumb: Blob }> {
  return { web: await fileToResizedBlob(file, 2048), thumb: await fileToResizedBlob(file, 400) };
}

export async function putToS3(url: string, blob: Blob, contentType = "image/jpeg"): Promise<void> {
  const res = await fetch(url, { method: "PUT", headers: { "content-type": contentType }, body: blob });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
}

// ---------------------------------------------------------------------------
// Video upload (Phase A): per-clip limits, browser-side thumbnail, no transcoding.
// Keep these in sync with backend config.maxVideoBytes (the server enforces size).
// ---------------------------------------------------------------------------

export const MAX_VIDEO_BYTES = 157_286_400; // 150 MB
export const MAX_VIDEO_SECONDS = 60;

export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
}

/** Reject if a promise doesn't settle within `ms` — keeps flaky <video> events from hanging the UI. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout: ${label}`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/** Read a video's duration via a hidden <video> element. */
function videoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error("video metadata load failed")); };
    v.src = url;
  });
}

/** Throws a user-facing Error if the clip is too big or too long. */
export async function validateVideo(file: File): Promise<void> {
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error(`Video ist zu groß (max. ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB).`);
  }
  // Duration may be unreadable for some codecs — only reject when we actually know it.
  // Time-boxed so a clip whose metadata never loads doesn't freeze "Prüfe Video …".
  let duration: number | null = null;
  try { duration = await withTimeout(videoDuration(file), 4000, "duration"); } catch { duration = null; }
  if (duration != null && Number.isFinite(duration) && duration > MAX_VIDEO_SECONDS + 0.5) {
    throw new Error(`Video ist zu lang (max. ${MAX_VIDEO_SECONDS} s).`);
  }
}

/** A dark placeholder thumbnail with a play triangle, used when frame grab fails. */
async function placeholderVideoThumb(): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = 400; c.height = 400;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#2a2440";
  ctx.fillRect(0, 0, 400, 400);
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.beginPath();
  ctx.moveTo(160, 140); ctx.lineTo(160, 260); ctx.lineTo(270, 200); ctx.closePath();
  ctx.fill();
  return new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob null"))), "image/jpeg", 0.8));
}

/** Grab a frame (~1s) as the video thumbnail; falls back to a placeholder. */
export async function makeVideoThumb(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";
    (video as HTMLVideoElement & { playsInline: boolean }).playsInline = true;
    video.src = url;

    await withTimeout(new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("video load failed"));
    }), 5000, "loadeddata");

    const target = Math.min(1, (video.duration || 2) / 2);
    await withTimeout(new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("seek failed"));
      video.currentTime = target;
    }), 5000, "seek");

    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) throw new Error("no frame");
    const scale = Math.min(1, 400 / Math.max(w, h));
    const cw = Math.round(w * scale), ch = Math.round(h * scale);
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    canvas.getContext("2d")!.drawImage(video, 0, 0, cw, ch);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob null"))), "image/jpeg", 0.85));
  } catch {
    return placeholderVideoThumb();
  } finally {
    URL.revokeObjectURL(url);
  }
}
