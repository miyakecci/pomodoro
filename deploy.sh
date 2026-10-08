#!/usr/bin/env bash
# 使い方: BUCKET=my-pomodoro-bucket DIST_ID=E123ABC ./deploy.sh
set -euo pipefail
: "${BUCKET:?BUCKET を指定してください}"
npm ci
npm run build
# ハッシュ付きアセットは長期キャッシュ、index.html はキャッシュさせない
aws s3 sync dist/ "s3://$BUCKET/" --delete --exclude index.html \
  --cache-control "public,max-age=31536000,immutable"
aws s3 cp dist/index.html "s3://$BUCKET/index.html" \
  --cache-control "no-cache" --content-type "text/html; charset=utf-8"
if [ -n "${DIST_ID:-}" ]; then
  aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/index.html" "/"
fi
echo "デプロイ完了"
