#!/usr/bin/env bash
# Deploy the feedback Worker through the Cloudflare API (no wrangler needed).
#   CF_ACCOUNT_ID=... [CF_API_TOKEN=...] ./deploy.sh
# First deploy: also pass ADMIN_TOKEN=... to set the admin password.
set -euo pipefail
cd "$(dirname "$0")"
NAME=riftholm-feedback
API="https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID:?set CF_ACCOUNT_ID}/workers/scripts/$NAME"
AUTH=()
if [ -n "${CF_API_TOKEN:-}" ]; then AUTH=(-H "Authorization: Bearer $CF_API_TOKEN"); fi

# The Durable Object migration only runs once; later deploys must not repeat it
EXISTING=$(curl -sS "${AUTH[@]}" "$API/settings" | grep -c '"success":true' || true)
if [ "$EXISTING" = "0" ]; then
  MIGRATIONS=',"migrations":{"new_tag":"v1","new_sqlite_classes":["FeedbackStore"]}'
else
  MIGRATIONS=''
fi
META=$(cat <<JSON
{"main_module":"index.js","compatibility_date":"2025-09-01",
 "bindings":[{"type":"durable_object_namespace","name":"FEEDBACK","class_name":"FeedbackStore"}],
 "keep_bindings":["secret_text"]$MIGRATIONS}
JSON
)
curl -sS --fail-with-body "${AUTH[@]}" -X PUT "$API" \
  -F "metadata=$META;type=application/json" \
  -F "index.js=@src/index.js;type=application/javascript+module" >/dev/null
echo "Uploaded $NAME"

if [ -n "${ADMIN_TOKEN:-}" ]; then
  curl -sS --fail-with-body "${AUTH[@]}" -X PUT "$API/secrets" -H 'Content-Type: application/json' \
    -d "{\"name\":\"ADMIN_TOKEN\",\"text\":\"$ADMIN_TOKEN\",\"type\":\"secret_text\"}" >/dev/null
  echo "Set ADMIN_TOKEN"
fi

curl -sS --fail-with-body "${AUTH[@]}" -X POST "$API/subdomain" -H 'Content-Type: application/json' \
  -d '{"enabled":true,"previews_enabled":false}' >/dev/null
echo "Enabled on workers.dev"
