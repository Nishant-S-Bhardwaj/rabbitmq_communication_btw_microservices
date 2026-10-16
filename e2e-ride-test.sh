
#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="http://localhost:3000"
TIMESTAMP="$(date +%s)-$RANDOM"
USER_EMAIL="test-user-${TIMESTAMP}@example.com"
CAPTAIN_EMAIL="test-captain-${TIMESTAMP}@example.com"
PASSWORD="TestPass123!"

for cmd in curl jq; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "ERROR: Install missing command: $cmd"
    exit 1
  }
done

# API helper: records HTTP status and response body.
api() {
  local method="$1"
  local url="$2"
  local token="${3:-}"
  local data="${4:-}"
  local raw

  local args=(-sS -X "$method" "$url"
    -H "Content-Type: application/json"
    -w $'\n%{http_code}')

  if [[ -n "$token" ]]; then
    args+=(-H "Authorization: Bearer $token")
  fi

  if [[ -n "$data" ]]; then
    args+=(-d "$data")
  fi

  raw="$(curl "${args[@]}")"
  LAST_STATUS="${raw##*$'\n'}"
  LAST_BODY="${raw%$'\n'*}"

  echo "HTTP $LAST_STATUS — $method $url"

  if [[ ! "$LAST_STATUS" =~ ^2[0-9][0-9]$ ]]; then
    echo "Response:"
    echo "$LAST_BODY" | jq . 2>/dev/null || echo "$LAST_BODY"
    return 1
  fi
}

echo
echo "======================================"
echo "1. REGISTER USER"
echo "======================================"

USER_DATA="$(jq -nc \
  --arg name "E2E Test User" \
  --arg email "$USER_EMAIL" \
  --arg password "$PASSWORD" \
  '{name:$name,email:$email,password:$password}')"

api POST "$BASE_URL/user/register" "" "$USER_DATA"
echo "$LAST_BODY" | jq .

echo
echo "======================================"
echo "2. LOGIN USER"
echo "======================================"

api POST "$BASE_URL/user/login" "" \
  "$(jq -nc --arg email "$USER_EMAIL" --arg password "$PASSWORD" \
    '{email:$email,password:$password}')"

USER_TOKEN="$(echo "$LAST_BODY" | jq -er '.token')"
echo "User login succeeded."

echo
echo "======================================"
echo "3. REGISTER CAPTAIN"
echo "======================================"

CAPTAIN_DATA="$(jq -nc \
  --arg name "E2E Test Captain" \
  --arg email "$CAPTAIN_EMAIL" \
  --arg password "$PASSWORD" \
  '{name:$name,email:$email,password:$password}')"

api POST "$BASE_URL/captain/register" "" "$CAPTAIN_DATA"
echo "$LAST_BODY" | jq .

echo
echo "======================================"
echo "4. LOGIN CAPTAIN"
echo "======================================"

api POST "$BASE_URL/captain/login" "" \
  "$(jq -nc --arg email "$CAPTAIN_EMAIL" --arg password "$PASSWORD" \
    '{email:$email,password:$password}')"

CAPTAIN_TOKEN="$(echo "$LAST_BODY" | jq -er '.token')"
echo "Captain login succeeded."

api PATCH "$BASE_URL/captain/toggle-availability" "$CAPTAIN_TOKEN"
echo "$LAST_BODY" | jq .

echo
echo "======================================"
echo "5. START CAPTAIN NEW-RIDE LISTENER"
echo "======================================"

EVENT_FILE="$(mktemp)"
trap 'rm -f "$EVENT_FILE"' EXIT

# Start long polling BEFORE creating the ride.
curl -sS --max-time 35 \
  -H "Authorization: Bearer $CAPTAIN_TOKEN" \
  "$BASE_URL/captain/new-ride" > "$EVENT_FILE" &
CAPTAIN_PID=$!

sleep 1

if ! kill -0 "$CAPTAIN_PID" 2>/dev/null; then
  echo "ERROR: Captain listener exited before ride creation."
  wait "$CAPTAIN_PID" || true
  cat "$EVENT_FILE"
  exit 1
fi

echo "Captain is waiting for the new-ride event."

echo
echo "======================================"
echo "6. CREATE RIDE"
echo "======================================"

RIDE_DATA="$(jq -nc \
  --arg pickup "NIT Raipur Main Gate" \
  --arg destination "Raipur Railway Station" \
  '{pickup:$pickup,destination:$destination}')"

api POST "$BASE_URL/ride/create-ride" "$USER_TOKEN" "$RIDE_DATA"
echo "$LAST_BODY" | jq .

RIDE_ID="$(echo "$LAST_BODY" | jq -er '.ride._id')"
echo "Ride ID: $RIDE_ID"

echo
echo "======================================"
echo "7. WAIT FOR CAPTAIN EVENT"
echo "======================================"

wait "$CAPTAIN_PID" || true

if [[ ! -s "$EVENT_FILE" ]] || ! jq -e . "$EVENT_FILE" >/dev/null 2>&1; then
  echo "ERROR: No JSON new-ride event received."
  echo "Check captain and ride service logs."
  echo "File response:"
  cat "$EVENT_FILE"
  exit 1
fi

echo "Captain received this ride event:"
jq . "$EVENT_FILE"

EVENT_RIDE_ID="$(jq -r '._id // empty' "$EVENT_FILE")"

if [[ "$EVENT_RIDE_ID" != "$RIDE_ID" ]]; then
  echo "ERROR: Captain event ride ID does not match created ride."
  exit 1
fi

echo "Ride event matches the created ride."

echo
echo "======================================"
echo "8. OBSERVE DRIVER QUEUE"
echo "======================================"

api GET "$BASE_URL/captain/queue-status" "$CAPTAIN_TOKEN"
echo "$LAST_BODY" | jq .

echo
echo "======================================"
echo "9. WAIT FOR DROP-OFF ACKNOWLEDGEMENT"
echo "======================================"

STATUS="requested"
for attempt in $(seq 1 60); do
  STATUS_BODY="$(curl -sS --max-time 10 \
    -H "Authorization: Bearer $USER_TOKEN" \
    "$BASE_URL/ride/status/$RIDE_ID")"
  STATUS="$(echo "$STATUS_BODY" | jq -r '.status // empty')"
  echo "Ride status: ${STATUS:-unknown}"
  [[ "$STATUS" == "completed" ]] && break
  sleep 1
done

if [[ "$STATUS" != "completed" ]]; then
  echo "ERROR: Ride did not complete within 60 seconds."
  echo "$STATUS_BODY" | jq .
  exit 1
fi

echo
echo "======================================"
echo "E2E TEST COMPLETED"
echo "======================================"
echo "User:         $USER_EMAIL"
echo "Captain:      $CAPTAIN_EMAIL"
echo "Ride ID:      $RIDE_ID"
echo "Final status: $STATUS"

