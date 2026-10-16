#!/usr/bin/env bash

set -u

BASE_URL="${BASE_URL:-http://localhost:3000}"
TOTAL_USERS="${TOTAL_USERS:-1000}"
CONCURRENCY="${CONCURRENCY:-10}"
RUN_ID="$(date +%s)"

SUCCESS=0
FAILED=0
NEXT_USER=0

process_user() {
    local i="$1"
    local email="loadtest_${RUN_ID}_${i}@example.com"
    local password="LoadTest_${RUN_ID}_${i}!"

    # Register user
    local register_response
    register_response=$(curl -sS --max-time 15 \
        -X POST "$BASE_URL/user/register" \
        -H "Content-Type: application/json" \
        -d "{\"name\":\"Load Test User $i\",\"email\":\"$email\",\"password\":\"$password\"}") || {
        echo "[$i] Registration request failed"
        return 1
    }

    # Login and extract JWT token
    local login_response token
    login_response=$(curl -sS --max-time 15 \
        -X POST "$BASE_URL/user/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$email\",\"password\":\"$password\"}") || {
        echo "[$i] Login request failed"
        return 1
    }

    token=$(printf '%s' "$login_response" |
        python3 -c 'import json,sys; print(json.load(sys.stdin).get("token",""))' 2>/dev/null) || true

    if [[ -z "$token" ]]; then
        echo "[$i] Login failed or token field is different"
        return 1
    fi

    # Create ride
    local ride_response
    ride_response=$(curl -sS --max-time 15 \
        -X POST "$BASE_URL/ride/create-ride" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $token" \
        -d "{\"pickup\":\"Test Pickup $i\",\"destination\":\"Test Destination $i\"}" \
        -w $'\n%{http_code}') || {
        echo "[$i] Ride request failed"
        return 1
    }

    local status
    status=$(printf '%s\n' "$ride_response" | tail -n 1)

    if [[ "$status" =~ ^2[0-9][0-9]$ ]]; then
        echo "[$i] Ride created (HTTP $status)"
        return 0
    else
        echo "[$i] Ride creation failed (HTTP $status)"
        printf '%s\n' "$ride_response" | sed '$d'
        return 1
    fi
}

export -f process_user
export BASE_URL RUN_ID

echo "API: $BASE_URL"
echo "Users: $TOTAL_USERS | Concurrent requests: $CONCURRENCY"
echo "Starting test..."

for ((i=1; i<=TOTAL_USERS; i+=CONCURRENCY)); do
    pids=()

    for ((j=i; j<i+CONCURRENCY && j<=TOTAL_USERS; j++)); do
        process_user "$j" &
        pids+=("$!")
    done

    for pid in "${pids[@]}"; do
        if wait "$pid"; then
            SUCCESS=$((SUCCESS+1))
        else
            FAILED=$((FAILED+1))
        fi
    done

    echo "Progress: $((SUCCESS+FAILED))/$TOTAL_USERS | Successful rides: $SUCCESS | Failed: $FAILED"
done

echo
echo "========== LOAD TEST SUMMARY =========="
echo "Total users attempted: $TOTAL_USERS"
echo "Successful rides:     $SUCCESS"
echo "Failed workflows:     $FAILED"
echo "======================================="
