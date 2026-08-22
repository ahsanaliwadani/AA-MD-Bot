#!/usr/bin/env bash
# Generate an AA MD Bot access key from the VPS over the local HTTP listener.
# Usage: ./scripts/generate-access-key.sh PHONE [EXPIRES_IN_DAYS] [CONNECTION_ID]

set -euo pipefail

PHONE="${1:?Usage: $0 PHONE [EXPIRES_IN_DAYS] [CONNECTION_ID]}"
EXPIRES_IN_DAYS="${2:-30}"
CONNECTION_ID="${3:-ssh-admin}"
API_URL="${ACCESS_KEY_API_URL:-http://127.0.0.1:5000/api/access-keys/generate}"
SECRET="${ACCESS_KEY_ENDPOINT_SECRET:-}"

if [[ -z "$SECRET" ]]; then
  read -r -s -p 'ACCESS_KEY_ENDPOINT_SECRET: ' SECRET
  printf '\n'
fi

if [[ -z "$SECRET" ]]; then
  echo 'ACCESS_KEY_ENDPOINT_SECRET is required.' >&2
  exit 1
fi

payload=$(node -e '
  const [phone, days, connectionId] = process.argv.slice(1);
  const data = { phone, connectionId, createdBy: "ssh-admin" };
  if (days) data.expiresInDays = Number(days);
  process.stdout.write(JSON.stringify(data));
' "$PHONE" "$EXPIRES_IN_DAYS" "$CONNECTION_ID")

curl --fail-with-body --silent --show-error \
  --request POST "$API_URL" \
  --header 'Content-Type: application/json' \
  --header "X-Access-Key-Secret: $SECRET" \
  --data "$payload"
printf '\n'
