# KlaRa Lambda — video-transcoder (Phase B)

Asynchronous video transcoding. An S3 `ObjectCreated` event on `items/{id}/source`
(only video originals — suffix `/source`) triggers `klara-video-transcoder`, which
produces `web.mp4` (720p H.264 + AAC, faststart) and `thumb.jpg`, repoints
`items.s3_key`, sets `items.processing = false`, and deletes the source.

**Account:** `123456789012` (lilapixel), region `eu-central-1`, arch **arm64**.
**Always use `--profile lilapixel`.**

## One-time / re-deploy

```bash
cd lambda/video-transcoder

# 1) ffmpeg layer (prints the LayerVersionArn):
LAYER_ARN="$(./build-layer.sh)"

# 2) function + role + S3 trigger (DATABASE_URL = the Neon pooled URL, same as Vercel):
DATABASE_URL='postgres://…neon…?sslmode=require' ./deploy.sh "$LAYER_ARN"
```

Re-running `deploy.sh` updates code + config idempotently. `build-layer.sh` only when
ffmpeg should change.

## Notes
- Requires the `KlaraPhaseBSetup` policy (via group `klara-admins`) on the executing user.
- `DATABASE_URL` is stored as a Lambda env var (encrypted at rest). Not in the repo.
- The S3 trigger uses `PutBucketNotificationConfiguration`, which **replaces** the bucket's
  whole notification config. KlaRa uses no other S3 events (verified empty).
- Cost: Lambda compute in the perpetual always-free tier; layer/code storage free → ~0 €/mo.
