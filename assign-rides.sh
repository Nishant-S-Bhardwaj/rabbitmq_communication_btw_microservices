
#!/usr/bin/env bash
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
TOTAL_RIDES="${TOTAL_RIDES:-400}"

read -rp "Captain email: " CAPTAIN_EMAIL
read -rsp "Captain password: " CAPTAIN_PASSWORD
echo

LOGIN=$(curl -fsS --max-time 15 \
  -X POST "$BASE_URL/captain/login" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c 'import json,os; print(json.dumps({"email":os.environ["CAPTAIN_EMAIL"],"password":os.environ["CAPTAIN_PASSWORD"]}))')" \
  2>/dev/null) || {
    echo "Captain login failed. Check credentials and API URL."
    exit 1
  }

TOKEN=$(printf '%s' "$LOGIN" |
  python3 -c 'import json,sys; print(json.load(sys.stdin).get("token",""))')

if [[ -z "$TOKEN" ]]; then
  echo "No JWT token returned by captain login."
  exit 1
fi

echo "Captain login successful."
echo "This script needs ride IDs to accept existing rides."
echo "Your current API does not expose a route to list requested rides."
echo "See the instructions below to retrieve IDs from MongoDB."

