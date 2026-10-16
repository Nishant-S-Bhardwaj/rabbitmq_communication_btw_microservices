# Request and Message Flow

## Services and data stores

- The API Gateway listens on port `3000` and proxies `/user` to user service `3001`, `/captain` to captain service `3002`, and `/ride` to ride service `3003`.
- User service uses MongoDB database `userdb`; captain service uses `captaindb`; ride service uses `ridedb`.
- Services connect to RabbitMQ at `rabbitmq:5672` inside Compose. The management UI is exposed on host port `15672`.

## 1. User login

1. Client sends `POST /user/login` to the gateway with `{ email, password }`.
2. Gateway forwards the request to user service. The user route invokes the login controller.
3. User service looks up the account in `userdb`, loads the stored password hash, and checks it with bcrypt.
4. On success, it signs a JWT using `JWT_SECRET`, returns the token, and sets a `token` cookie. Clients use the returned token in `Authorization: Bearer <token>` for API calls.
5. The user auth middleware verifies the JWT, checks the blacklist, loads the user, and sets `req.user` before protected ride routes continue.

## 2. Ride request and durable enqueue

1. Authenticated client sends `POST /ride/create-ride` with `pickup` and `destination` and the bearer token.
2. Gateway proxies the request to ride service. User auth verifies the token and provides `req.user`.
3. Ride service creates a document in `ridedb` with the user ID and status `requested`, then saves it.
4. Only after MongoDB save succeeds, ride service publishes the ride JSON to the durable `new-ride` RabbitMQ queue with persistent delivery and waits for publisher confirmation.
5. The API returns HTTP `201` and the saved ride. MongoDB stores ride state; RabbitMQ stores the dispatch message until acknowledged.

## 3. Driver notification and assignment

1. Captain service connects to RabbitMQ on startup and registers `DRIVER_WORKERS` consumers on `new-ride`. Each consumer uses `prefetch(1)`, so it owns at most one unacknowledged message at a time.
2. A consumer calls the ride service's internal `GET /internal/rides/:rideId` endpoint. It authenticates with `x-service-token` using `INTERNAL_API_TOKEN` (or the configured JWT secret fallback).
3. The worker attempts an atomic MongoDB update in `captaindb`: find a captain with `isAvailable: true`, then set `isAvailable: false` and `currentRideId` to this ride.
4. If no captain is available, the worker waits one second and checks the persisted ride again. The RabbitMQ message stays unacknowledged during this wait.
5. When a captain is reserved, the worker calls the ride service's internal `PATCH /internal/rides/:rideId` with action `accept` and the captain ID. The ride service changes `requested` to `accepted` using a conditional update.
6. The captain controller's `/captain/new-ride` long-poll endpoint is a separate in-memory notification. The worker notifies pending listeners when processing begins; this notification is not the driver assignment mechanism.

## 4. Simulated pickup, trip, and acknowledgement

1. After `accepted`, the worker waits `PICKUP_DELAY_MS` (Compose default `5000` ms), then requests the `accepted` to `started` transition.
2. After `started`, it waits `TRIP_DURATION_MS` (Compose default `15000` ms), then requests the `started` to `completed` transition.
3. The worker clears the captain's `currentRideId`, marks the captain available, and returns successfully.
4. Only after the callback returns does the RabbitMQ consumer acknowledge the `new-ride` message. On processing error, it negatively acknowledges and requeues the message.
5. If the worker process restarts while a message is unacknowledged, RabbitMQ can redeliver it. The worker reads the ride's saved status and resumes the remaining lifecycle steps.

## 5. Rider status and queue monitoring

- Rider polls `GET /ride/status/:rideId` with a bearer token. Ride service returns the document only if it belongs to the authenticated user; statuses are `requested`, `accepted`, `started`, and `completed`.
- `GET /captain/queue-status` returns `messagesReady` and consumer count. `messagesReady` excludes messages already delivered to consumers.
- `./queue-status.sh` polls RabbitMQ's management API and prints ready messages, unacknowledged (in-flight) messages, and consumer count.
- In RabbitMQ, `new-ride` is the dispatch backlog. A message moves from ready to unacknowledged when a consumer receives it, then disappears after acknowledgement. With a backlog and one consumer using `prefetch(1)`, unacknowledged commonly stays at one.

## Current `ride-accepted` behavior

User service has a consumer for the `ride-accepted` queue and a long-poll `GET /user/accepted-ride` route. The captain worker currently does not publish to `ride-accepted`, so this queue remains empty. Acceptance is currently visible by polling the ride's MongoDB status endpoint; no accepted event is sent to that queue.

## Relevant code

- Gateway routing: `gateway/app.js`
- User login and accepted-event listener: `user/controllers/user.controller.js`
- Ride creation and status transitions: `ride/controllers/ride.controller.js`
- Ride queue producer: `ride/services/rabbit.js`
- Captain queue consumer: `captain/services/rabbit.js`
- Driver assignment and trip simulation: `captain/services/rideWorker.js`
- Route registration and internal service authentication: `ride/routes/ride.routes.js`
- Compose service topology and timing/worker settings: `docker-compose.yml`
