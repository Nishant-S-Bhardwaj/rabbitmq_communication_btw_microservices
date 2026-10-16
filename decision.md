# Decision Log

Record operational decisions here with the context, alternatives, chosen option, and trade-offs. Update this file when a later change supersedes a decision.

## 2026-10-16: Set the default driver worker pool to three

**Context**

- Compose defaulted `DRIVER_WORKERS` to `1`.
- MongoDB contains three captain records; all three were busy when checked.
- RabbitMQ showed a large `new-ride` backlog, one unacknowledged message, and one consumer.

**Options considered**

1. Keep one worker. This accurately models one driver, but limits processing to one active ride at a time.
2. Set ten workers immediately. This would consume up to ten messages, but there are only three captain records. Extra workers could hold messages while polling for an available captain; it would not create driver capacity.
3. Set three workers to match the existing captain pool. This allows up to three rides to be processed concurrently when three captains are available.

**Decision**

Use three workers as the Compose default and in `.env.example`. A worker is not a driver: actual ride throughput is bounded by the number of captains marked available. Never mark a captain available while `currentRideId` indicates an active ride.

**Trade-off and next step**

Three workers can increase concurrency only when three captains are actually available. For ten simultaneous rides, provision and make available ten captains, then set `DRIVER_WORKERS=10`. Do not increase consumers alone and describe that as ten-driver capacity.

## 2026-10-16: Keep ride state in MongoDB and dispatch work in RabbitMQ

The ride service saves each ride before publishing its persistent `new-ride` message. MongoDB is the source of the ride's current status; RabbitMQ holds dispatch work until a consumer acknowledges it. A second database copy of queue messages would duplicate state without improving the current workflow.

The database stores the current status, not a complete transition history. Add a dedicated audit/event history only if historical status timelines become a requirement.

## 2026-10-16: Treat `ride-accepted` as not yet wired

The user service declares and consumes `ride-accepted`, and exposes `/user/accepted-ride`, but the captain ride worker currently does not publish to that queue. Its emptiness is expected with the current producer path. The dispatch message is `new-ride`; acceptance is written to the ride document in MongoDB. Add a publisher only when consumers need an explicit accepted event.
