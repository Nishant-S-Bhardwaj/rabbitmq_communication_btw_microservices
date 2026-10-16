#!/usr/bin/env bash
set -euo pipefail

MANAGEMENT_URL="${RABBITMQ_MANAGEMENT_URL:-http://localhost:15672}"
RABBITMQ_USER="${RABBITMQ_USER:-guest}"
RABBITMQ_PASSWORD="${RABBITMQ_PASSWORD:-guest}"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-2}"

for command in curl jq; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "ERROR: Install $command first."
    exit 1
  }
done

echo "Watching RabbitMQ queue 'new-ride' at $MANAGEMENT_URL"
while true; do
  curl -fsS -u "$RABBITMQ_USER:$RABBITMQ_PASSWORD" \
    "$MANAGEMENT_URL/api/queues/%2F/new-ride" |
    jq -r '"[\(now | strftime("%H:%M:%S"))] ready=\(.messages_ready) in_flight=\(.messages_unacknowledged) consumers=\(.consumers)"'
  sleep "$INTERVAL_SECONDS"
done
