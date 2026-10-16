
#!/usr/bin/env bash
set -euo pipefail

DURATION="${DURATION:-60}"
RIDE_IDS_FILE="${RIDE_IDS_FILE:-accepted-ride-ids.txt}"

if [[ ! -f "$RIDE_IDS_FILE" ]]; then
  echo "Missing $RIDE_IDS_FILE"
  echo "Put one accepted ride ID per line."
  exit 1
fi

while IFS= read -r ride_id; do
  [[ -z "$ride_id" ]] && continue

  echo "Simulating ride $ride_id for ${DURATION}s..."
  sleep "$DURATION"
  echo "Simulation finished for ride $ride_id"
done < "$RIDE_IDS_FILE"

