# Linkz Seat Reservation Platform

A small public seat reservation platform built as a technical assessment for Linkz. The brief was to build a system where authenticated users can browse 3 available seats, select one, proceed through a mock payment flow, and have the seat confirmed on success.

The app is intentionally scoped — the value is in the engineering decisions, not feature breadth.

---

## Quick Start

### Prerequisites

- Node.js 18+
- MongoDB running locally (default port 27017)
  - Install via [Homebrew](https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-os-x/): `brew install mongodb-community && brew services start mongodb-community`
  - Or run with Docker: `docker run -d -p 27017:27017 --name mongo mongo:7`

### 1. Clone and install

```bash
git clone https://github.com/usman10scorpio/linkz.git
cd linkz
npm run install:all
```

### 2. Configure environment

```bash
cp .env.example backend/.env
```

Open `backend/.env` and replace `JWT_SECRET` with a long random string:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Seed the database

```bash
npm run seed
```

This creates the 3 seats with status `available`. The script is idempotent — safe to run multiple times.

### 4. Run the app

Open two terminals:

```bash
# Terminal 1 — backend (http://localhost:4000)
npm run dev:backend

# Terminal 2 — frontend (http://localhost:5173)
npm run dev:frontend
```

Then open [http://localhost:5173](http://localhost:5173).

---

## Environment Variables

All backend config lives in `backend/.env`. See `.env.example` at the repo root for the full reference with descriptions.

| Variable         | Required | Default                     | Notes                                     |
|------------------|----------|-----------------------------|-------------------------------------------|
| `MONGODB_URI`    | Yes      | —                           | MongoDB connection string                 |
| `JWT_SECRET`     | Yes      | —                           | Long random string, never commit this     |
| `PORT`           | No       | `4000`                      | Backend port                              |
| `CLIENT_ORIGIN`  | No       | `http://localhost:5173`     | Frontend origin (CORS)                    |
| `NODE_ENV`       | No       | `development`               | Set to `production` for prod deployments  |
| `LOG_LEVEL`      | No       | `info`                      | winston log level                         |

---

## Project Structure

```
linkz/
├── backend/
│   ├── src/
│   │   ├── config/           # DB connection, logger
│   │   ├── middleware/        # JWT auth, error handler
│   │   ├── models/            # Mongoose models: User, Seat, Booking
│   │   ├── routes/            # Express routes: auth, seats, payments
│   │   ├── services/          # Business logic: seatService, paymentService
│   │   ├── scripts/           # seed.ts — creates the 3 seats
│   │   └── index.ts           # Server entry point
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/               # Axios client with interceptors
│   │   ├── components/        # Navbar, SeatCard, CheckoutForm, etc.
│   │   ├── context/           # AuthContext (React Context + hooks)
│   │   ├── pages/             # Login, Register, Home, Checkout, Success, Failure
│   │   └── utils/             # Error helpers
│   └── package.json
├── .env.example               # Environment variable reference
├── .gitignore
├── LICENSE
├── package.json               # Root scripts (install:all, dev:backend, dev:frontend, seed)
└── README.md
```

---

## API Reference

| Method | Endpoint                    | Auth | Description                           |
|--------|-----------------------------|------|---------------------------------------|
| POST   | `/api/auth/register`        | No   | Create account                        |
| POST   | `/api/auth/login`           | No   | Login, sets httpOnly cookie           |
| POST   | `/api/auth/logout`          | No   | Clears cookie                         |
| GET    | `/api/auth/me`              | Yes  | Returns current user from cookie      |
| GET    | `/api/seats`                | Yes  | List all seats (triggers hold expiry) |
| POST   | `/api/seats/:id/hold`       | Yes  | Atomically hold a seat                |
| DELETE | `/api/seats/:id/hold`       | Yes  | Release a hold early                  |
| POST   | `/api/payments/process`     | Yes  | Charge card, finalise booking         |
| GET    | `/api/payments/booking/:id` | Yes  | Get booking status                    |

---

## Testing the Mock Payment

The payment gateway is simulated. Use these card numbers to test different outcomes:

| Card Number           | Result             |
|-----------------------|--------------------|
| Any valid number      | ~90% success rate  |
| `xxxx xxxx xxxx 0000` | Always declined    |
| `xxxx xxxx xxxx 1111` | Insufficient funds |

---

## Engineering Decisions

This section is the most important part of this submission. The app is small by design; what matters is how the hard problems are handled.

### 1. Concurrency — preventing double-booking

The central correctness requirement is that two users requesting the same seat simultaneously must never both succeed.

**Approach:** MongoDB atomic `findOneAndUpdate` with a filter condition.

```typescript
const seat = await Seat.findOneAndUpdate(
  { _id: seatId, status: 'available' },   // only matches if still available
  { $set: { status: 'held', heldBy: userId, heldUntil } },
  { new: true },
);
```

MongoDB guarantees document-level atomicity for a single update. Only one concurrent caller can match `{ status: 'available' }` and win the update — any other request in flight will find the document no longer matches the filter and receive `null`. The losing request gets a clean 409 conflict response.

**Why not a multi-document transaction?** The hold operation touches a single document. MongoDB's document-level atomicity is sufficient here, and transactions add overhead and complexity that isn't justified at this scale.

**What I'd do at higher scale:** For very high concurrent load, a distributed lock (Redis `SET NX PX`) on the seat ID would eliminate the retry-on-conflict cost. At the scale this assessment implies, the MongoDB approach is clean and sufficient.

---

### 2. Seat holds with expiry — preventing stale checkouts

A user who selects a seat but abandons the checkout must not lock it forever.

**Approach:** Each hold is given a 2-minute expiry timestamp (`heldUntil`). Expired holds are released lazily: every time `GET /seats` is called, the service runs a bulk `updateMany` to reset any hold whose `heldUntil` has passed.

**Trade-off:** Lazy cleanup means a hold technically stays in the `held` state until the next `GET /seats` call. In this app, the frontend polls every 3 seconds, so the practical maximum drift is 3 seconds. For a production system, I'd add a background job (a simple cron, or a MongoDB change stream consumer) to run the cleanup on a fixed schedule regardless of traffic.

**Why 2 minutes?** Short enough to keep seats moving quickly in a demo environment. In a real ticketing platform this would be longer (10–15 minutes) to give users on slow connections enough time to complete checkout — a product decision that deserves explicit stakeholder input. I'd make it configurable via an environment variable in production.

---

### 3. Payment integrity and idempotency

Two problems need solving: only reserve the seat if payment succeeds, and prevent double-booking if a payment request is retried.

**Reserve on success only:** The booking starts in `pending` state when the seat is held. The seat only transitions to `reserved` after the mock gateway returns success. On failure, the seat is immediately released back to `available`.

**Idempotency:** Before charging the card, the service checks `booking.paymentResult`. If it's already set, the stored result is returned without re-processing. This handles client retries (e.g. the user double-clicks, or the frontend retries after a network timeout) without double-charging or double-booking.

**Ordering:** The payment result is written to the booking document *before* the seat state is updated. This means the worst-case partial failure (booking updated, seat update fails) leaves the booking marked `completed`/`failed` but the seat in the wrong state. In practice, this is corrected by the hold expiry — but for production, I'd wrap these two updates in a MongoDB multi-document transaction to ensure atomicity.

---

### 4. Session security — the 90-day token trade-off

A 90-day session is a deliberate product convenience choice. The security implications are real and worth naming:

- A stolen token is valid for up to 90 days with no way to revoke it without a token blocklist
- I store the JWT in an `httpOnly`, `sameSite: lax` cookie to protect against XSS theft and most CSRF vectors
- The auth middleware verifies the token *and* does a lightweight DB lookup to confirm the user still exists — this means deleting a user from the DB immediately invalidates their session, which is a reasonable revocation mechanism for this scale

**What I'd harden for production:**
- Short-lived access tokens (15 minutes) paired with refresh tokens, so revocation is instant
- A Redis token blocklist for explicit logout of specific sessions
- Rate limiting on auth endpoints (in place but lenient for local dev)
- `secure: true` on cookies (enforced in production via `NODE_ENV` check)
- HTTPS throughout

---

### 5. Operations — observability basics

The app has structured JSON logging in production (via winston) and human-readable colourised logs in development. Every significant state change — seat held, seat released, payment processed — emits a log entry with the relevant IDs.

A `/healthz` endpoint returns 200 when the server is up, suitable for a load balancer health check.

**What I'd add for production:**
- Metrics (Prometheus or Datadog APM) on payment success/failure rates, hold-to-checkout conversion, and seat availability over time
- Alerting on elevated payment failure rates or unexpected hold expiry spikes
- Correlation IDs on requests (passed through to all log entries) for tracing a single user's journey through logs

---

## What I Deliberately Deferred

Within the ~2-hour scope, the following were consciously cut:

| Deferred feature | Reasoning |
|---|---|
| Email confirmation | Requires an email provider and adds infra complexity with no assessment value |
| Refresh token rotation | Short-lived token + refresh pattern is the right production choice but overkill for a demo |
| Full test suite | I would normally add unit tests for `seatService` (especially the concurrency path) and integration tests for the API. Deferred to stay within time budget. |
| Admin UI / seat management | Out of scope for the brief |
| Multi-document transactions | The partial-failure window is small and recoverable; transactions are the right production hardening |
| Webhook-style payment confirmation | A real payment provider (Stripe) uses async webhooks; the mock uses synchronous responses for simplicity |

---

## Stack Rationale

| Choice | Why |
|---|---|
| Node.js + Express | Fast to move in, no magic, easy to reason about request/response lifecycle |
| TypeScript end-to-end | Catches whole classes of bugs at compile time; important for payment and concurrency logic |
| MongoDB | Flexible schema for a prototype, document-level atomicity sufficient for single-seat holds, easy local setup |
| Mongoose | Strong TypeScript integration, readable schema definitions |
| JWT in httpOnly cookies | Secure defaults without needing a session store; the 90-day requirement is met cleanly |
| React + Vite | Fast dev experience, no SSR complexity needed for this scope |
| Tailwind CSS | Rapid, consistent UI without a component library dependency |
| Zod | Schema validation at the API boundary; rejects malformed input before it reaches business logic |

---

## Known Limitations

1. **No real payment processing** — the gateway is a mock. A production system would use Stripe (or similar) with webhook confirmation.
2. **Lazy hold expiry** — the 3-second polling window means a held seat can appear occupied for slightly longer than 2 minutes to concurrent users.
3. **Single-node assumption** — the seat hold logic is correct on a single Node process. Running multiple backend replicas without a distributed lock (Redis) would require careful review of the concurrent update behaviour.
4. **No persistent session revocation** — logging out clears the cookie client-side, but the JWT itself remains valid until it expires. A blocklist would fix this.

---

## What I'd Do Next (Production Hardening)

1. Wrap the booking + seat state update in a MongoDB session transaction
2. Replace the mock payment with Stripe + webhook confirmation
3. Add Redis for distributed seat locking under multi-replica deployment
4. Short-lived JWTs + refresh token rotation + Redis blocklist for logout
5. Unit tests for `seatService.holdSeat` (concurrency race), `paymentService.processPayment` (idempotency), and auth middleware
6. Structured request tracing with correlation IDs
7. Prometheus metrics + Grafana dashboard: payment success rate, hold expiry rate, booking funnel
