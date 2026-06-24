#!/usr/bin/env bash
# Deploys the klara-video-transcoder Lambda + S3 trigger. Idempotent.
# Usage:  DATABASE_URL='postgres://…' ./deploy.sh <ffmpeg-layer-arn>
set -euo pipefail

PROFILE="${AWS_PROFILE:-lilapixel}"
REGION="${AWS_REGION:-eu-central-1}"
ACCT="123456789012"
FN="klara-video-transcoder"
ROLE="klara-video-transcoder-role"
BUCKET="klara-fotos-example"

: "${DATABASE_URL:?set DATABASE_URL (Neon pooled URL)}"
LAYER_ARN="${1:?usage: ./deploy.sh <ffmpeg-layer-arn> (from build-layer.sh)}"
here="$(cd "$(dirname "$0")" && pwd)"

# 1) Execution role (create if missing) + inline policy (S3 objects + own logs).
if ! aws iam get-role --role-name "$ROLE" --profile "$PROFILE" >/dev/null 2>&1; then
  echo "→ creating execution role …" >&2
  aws iam create-role --role-name "$ROLE" --profile "$PROFILE" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
fi
aws iam put-role-policy --role-name "$ROLE" --policy-name klara-transcoder-inline --profile "$PROFILE" \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[
      {\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:PutObject\",\"s3:DeleteObject\"],\"Resource\":\"arn:aws:s3:::$BUCKET/*\"},
      {\"Effect\":\"Allow\",\"Action\":[\"logs:CreateLogGroup\",\"logs:CreateLogStream\",\"logs:PutLogEvents\"],\"Resource\":\"arn:aws:logs:$REGION:$ACCT:log-group:/aws/lambda/$FN:*\"}
    ]
  }" >/dev/null
echo "→ waiting for role propagation …" >&2
sleep 10

# 2) Package handler + prod deps.
rm -rf "$here/build" "$here/function.zip"
mkdir -p "$here/build"
cp "$here/index.mjs" "$here/package.json" "$here/build/"
( cd "$here/build" && npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1 )
( cd "$here/build" && zip -qr9 "$here/function.zip" . )

# 3) Create or update the function.
COMMON_CFG=(--timeout 300 --memory-size 2048 --ephemeral-storage Size=4096
  --layers "$LAYER_ARN" --environment "Variables={DATABASE_URL=$DATABASE_URL}"
  --profile "$PROFILE" --region "$REGION")
if aws lambda get-function --function-name "$FN" --profile "$PROFILE" --region "$REGION" >/dev/null 2>&1; then
  echo "→ updating function code …" >&2
  aws lambda update-function-code --function-name "$FN" --zip-file "fileb://$here/function.zip" --profile "$PROFILE" --region "$REGION" >/dev/null
  aws lambda wait function-updated --function-name "$FN" --profile "$PROFILE" --region "$REGION"
  echo "→ updating function config …" >&2
  aws lambda update-function-configuration --function-name "$FN" "${COMMON_CFG[@]}" >/dev/null
else
  echo "→ creating function …" >&2
  aws lambda create-function --function-name "$FN" \
    --runtime nodejs22.x --architectures arm64 --handler index.handler \
    --role "arn:aws:iam::$ACCT:role/$ROLE" --zip-file "fileb://$here/function.zip" \
    "${COMMON_CFG[@]}" >/dev/null
fi
aws lambda wait function-updated --function-name "$FN" --profile "$PROFILE" --region "$REGION"

# 4) Allow S3 to invoke (idempotent).
aws lambda add-permission --function-name "$FN" --statement-id s3invoke \
  --action lambda:InvokeFunction --principal s3.amazonaws.com \
  --source-arn "arn:aws:s3:::$BUCKET" --source-account "$ACCT" \
  --profile "$PROFILE" --region "$REGION" >/dev/null 2>&1 || true

# 5) Wire the S3 trigger (suffix /source). NOTE: replaces the bucket's whole
#    notification config — KlaRa uses no other S3 events, verified empty.
aws s3api put-bucket-notification-configuration --bucket "$BUCKET" --profile "$PROFILE" --region "$REGION" \
  --notification-configuration "{
    \"LambdaFunctionConfigurations\":[{
      \"LambdaFunctionArn\":\"arn:aws:lambda:$REGION:$ACCT:function:$FN\",
      \"Events\":[\"s3:ObjectCreated:*\"],
      \"Filter\":{\"Key\":{\"FilterRules\":[{\"Name\":\"suffix\",\"Value\":\"/source\"}]}}
    }]
  }"

rm -rf "$here/build" "$here/function.zip"
echo "✓ deployed $FN ($REGION) with trigger on s3://$BUCKET (suffix /source)" >&2
