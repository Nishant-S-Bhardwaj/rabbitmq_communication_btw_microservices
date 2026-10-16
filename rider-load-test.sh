
#!/usr/bin/env bash

set -u

BASE_URL="${BASE_URL:-http://localhost:3000}"
RIDER_COUNT=20
PASSWORD="LoadTest@123"
MIN_DELAY=3
MAX_DELAY=10

declare -a TOKENS=()
TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"; echo; echo "Load test stopped."' EXIT INT TERM

# Check dependencies
for cmd in curl jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: Install $cmd first."
    exit 1
  fi
done

echo "Checking API Gateway: $BASE_URL"
if ! curl -sS --max-time 5 "$BASE_URL" >/dev/null 2>&1; then
  echo "WARNING: Gateway root did not respond successfully."
  echo "Continuing; your gateway may not define a / route."
fi

echo
echo "Creating/logging in $RIDER_COUNT riders..."

RUN_ID="$(date +%s)"

for i in $(seq 1 "$RIDER_COUNT"); do
  NAME="Load Rider $i"
  EMAIL="loadrider_${RUN_ID}_${i}@example.com"

  # Register rider; if the account already exists, login can still work.
  REGISTER_RESPONSE="$(curl -sS --max-time 15 \
    -X POST "$BASE_URL/user/register" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$NAME\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
    || true)"

  # Login
  LOGIN_RESPONSE="$(curl -sS --max-time 15 \
    -X POST "$BASE_URL/user/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
    || true)"

  TOKEN="$(echo "$LOGIN_RESPONSE" | jq -r \
    '.token // .data.token // .accessToken // .data.accessToken // empty' \
    2>/dev/null || true)"

  if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
    echo "FAILED: $EMAIL"
    echo "Login response: $LOGIN_RESPONSE"
    continue
  fi

  TOKENS+=("$TOKEN")
  echo "Rider $i ready (${#TOKENS[@]} authenticated riders)"
done

if [[ "${#TOKENS[@]}" -eq 0 ]]; then
  echo "No riders authenticated. Check login response/token field."
  exit 1
fi

echo
echo "Starting continuous ride simulation."
echo "Press Ctrl+C to stop."
echo

RIDE_NUMBER=0

while true; do
  RIDER_INDEX=$(( RANDOM % ${#TOKENS[@]} ))
  TOKEN="${TOKENS[$RIDER_INDEX]}"
  RIDE_NUMBER=$((RIDE_NUMBER + 1))

  PICKUP_NUMBER=$(( RANDOM % 20 + 1 ))
  DESTINATION_NUMBER=$(( RANDOM % 20 + 1 ))

  while [[ "$PICKUP_NUMBER" -eq "$DESTINATION_NUMBER" ]]; do
    DESTINATION_NUMBER=$(( RANDOM % 20 + 1 ))
  done

  PICKUP="Test Pickup $PICKUP_NUMBER"
  DESTINATION="Test Destination $DESTINATION_NUMBER"

  HTTP_CODE="$(curl -sS --max-time 20 \
    -o "$TMP_FILE" -w '%{http_code}' \
    -X POST "$BASE_URL/ride/create-ride" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"pickup\":\"$PICKUP\",\"destination\":\"$DESTINATION\"}" \
    || true)"

  echo "[$(date '+%H:%M:%S')] Ride #$RIDE_NUMBER | Rider $((RIDER_INDEX + 1)) | HTTP $HTTP_CODE"

  if [[ "$HTTP_CODE" != "201" ]]; then
    echo "Response:"
    cat "$TMP_FILE"
    echo
  else
    jq -c '{message, ride: { _id: .ride._id, pickup: .ride.pickup, destination: .ride.destination, status: .ride.status }}' \
      "$TMP_FILE" 2>/dev/null || cat "$TMP_FILE"
    echo
  fi

  # Random interval: 3–10 seconds
  sleep $(( RANDOM % (MAX_DELAY - MIN_DELAY + 1) + MIN_DELAY ))
done

