// KlaRa video transcoder (Phase B).
// Triggered by S3 ObjectCreated on `items/{id}/source`. Transcodes to 720p H.264
// (web.mp4) + a jpeg thumbnail, repoints items.s3_key, clears items.processing,
// deletes the original source. On failure: clears processing, keeps source as a
// (degraded) fallback so nothing stays stuck in "processing".
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, rmSync } from "node:fs";
import postgres from "postgres";

const REGION = process.env.AWS_REGION || "eu-central-1";
const FFMPEG = "/opt/bin/ffmpeg"; // provided by the klara-ffmpeg layer
const s3 = new S3Client({ region: REGION });

// Reused across warm invocations. Neon pooled URL; prepare:false is mandatory.
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1, prepare: false });

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });
  if (r.status !== 0) throw new Error(`${cmd} exited with ${r.status}`);
}

export const handler = async (event) => {
  for (const rec of event.Records ?? []) {
    const bucket = rec.s3.bucket.name;
    const key = decodeURIComponent(rec.s3.object.key.replace(/\+/g, " "));
    const m = key.match(/^items\/([^/]+)\/source$/);
    if (!m) { console.log("skip (not a source key):", key); continue; }

    const itemId = m[1];
    const src = `/tmp/${itemId}-source`;
    const web = `/tmp/${itemId}-web.mp4`;
    const thumb = `/tmp/${itemId}-thumb.jpg`;
    const webKey = `items/${itemId}/web.mp4`;
    const thumbKey = `items/${itemId}/thumb.jpg`;

    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      writeFileSync(src, Buffer.from(await obj.Body.transformToByteArray()));

      // 720p cap on the longer edge, even dimensions, AAC audio, faststart for web.
      run(FFMPEG, [
        "-y", "-i", src,
        "-vf", "scale=1280:1280:force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        web,
      ]);
      run(FFMPEG, [
        "-y", "-ss", "1", "-i", src, "-frames:v", "1",
        "-vf", "scale=640:640:force_original_aspect_ratio=decrease:force_divisible_by=2",
        thumb,
      ]);

      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: webKey, Body: readFileSync(web), ContentType: "video/mp4" }));
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: thumbKey, Body: readFileSync(thumb), ContentType: "image/jpeg" }));

      await sql`update items set s3_key = ${webKey}, processing = false where id = ${itemId}::uuid`;
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      console.log("transcoded", itemId);
    } catch (err) {
      console.error("transcode failed for", itemId, err);
      try { await sql`update items set processing = false where id = ${itemId}::uuid`; } catch (e) { console.error("db fallback failed", e); }
    } finally {
      for (const p of [src, web, thumb]) { try { rmSync(p, { force: true }); } catch { /* ignore */ } }
    }
  }
  return { ok: true };
};
