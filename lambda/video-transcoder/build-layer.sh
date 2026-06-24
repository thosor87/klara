#!/usr/bin/env bash
# Builds + publishes the `klara-ffmpeg` Lambda layer (static arm64 ffmpeg).
# Publishes via S3 (layer zip can exceed the 50 MB direct-upload limit).
# Prints the LayerVersionArn on the last line — pass it to deploy.sh.
set -euo pipefail

PROFILE="${AWS_PROFILE:-lilapixel}"
REGION="${AWS_REGION:-eu-central-1}"
BUCKET="klara-fotos-example"
LAYER_NAME="klara-ffmpeg"
FFMPEG_URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "→ downloading static arm64 ffmpeg …" >&2
curl -fsSL -o "$work/ffmpeg.tar.xz" "$FFMPEG_URL"
tar -xf "$work/ffmpeg.tar.xz" -C "$work"
bindir="$(find "$work" -maxdepth 1 -type d -name 'ffmpeg-*-arm64-static')"

mkdir -p "$work/layer/bin"
cp "$bindir/ffmpeg" "$work/layer/bin/ffmpeg"
chmod +x "$work/layer/bin/ffmpeg"
(cd "$work/layer" && zip -qr9 ../layer.zip bin)

echo "→ uploading layer zip to s3 …" >&2
aws s3 cp "$work/layer.zip" "s3://$BUCKET/_deploy/ffmpeg-layer.zip" --profile "$PROFILE" --region "$REGION" >&2

echo "→ publishing layer version …" >&2
arn="$(aws lambda publish-layer-version \
  --layer-name "$LAYER_NAME" \
  --description "static ffmpeg (arm64) for klara video transcoding" \
  --content "S3Bucket=$BUCKET,S3Key=_deploy/ffmpeg-layer.zip" \
  --compatible-architectures arm64 \
  --compatible-runtimes nodejs22.x nodejs20.x \
  --profile "$PROFILE" --region "$REGION" \
  --query 'LayerVersionArn' --output text)"

aws s3 rm "s3://$BUCKET/_deploy/ffmpeg-layer.zip" --profile "$PROFILE" --region "$REGION" >&2 || true

echo "$arn"
