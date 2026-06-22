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

export async function putToS3(url: string, blob: Blob): Promise<void> {
  const res = await fetch(url, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: blob });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
}
