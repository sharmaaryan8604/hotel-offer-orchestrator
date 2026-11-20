# Hotel Offer Orchestrator

Node.js + TypeScript + Express + Temporal + Redis + Docker Compose.

## Quick start (Docker)

**Prerequisite:** Docker Engine / Docker Desktop with Compose v2.

```bash
docker compose up --build -d
docker compose ps
curl 'http://localhost:3000/api/hotels?city=delhi'
curl 'http://localhost:3000/api/hotels?city=delhi&minPrice=5500&maxPrice=7500'
```

- API: http://localhost:3000
- Temporal development UI: http://localhost:8233
- Redis: localhost:6379 (development only)
- Temporal gRPC: localhost:7233

The Temporal dev server is **for local development, not production**; it uses an ephemeral development setup. Redis data is persisted in a named volume with AOF. For production use a persistent Temporal Server/Cloud, managed Redis, authentication/TLS, and restrict network ports.

## API

`GET /api/hotels?city=delhi` — obtains offers from both mock supplier APIs via Temporal, chooses the lowest price per case-insensitive name, atomically saves the complete snapshot in Redis, then fetches the final list from Redis.

`GET /api/hotels?city=delhi&minPrice=5500&maxPrice=7500` — same orchestration, but Redis **ZRANGEBYSCORE** filters by inclusive price bounds. Either bound is optional. Prices must be nonnegative; invalid ranges return HTTP 400.

`GET /supplierA/hotels?city=delhi` and `GET /supplierB/hotels?city=delhi` — mocked JSON APIs. City is optional here (omitting returns all mocked cities).

`GET /health` — reports status of each supplier and Redis. Returns HTTP 503 if Redis and both suppliers are unavailable; when one supplier is unavailable but Redis is healthy, it returns a degraded 200 status.

### Sample full response (Delhi)

```json
[
  {"name":"Holtin","price":5340,"supplier":"Supplier B","commissionPct":20},
  {"name":"Radison","price":5900,"supplier":"Supplier A","commissionPct":13},
  {"name":"The Imperial","price":7200,"supplier":"Supplier B","commissionPct":15},
  {"name":"Taj Palace","price":8500,"supplier":"Supplier A","commissionPct":12}
]
```

### Example filtered response (Delhi: 5500–7500)

```json
[
  {"name":"Radison","price":5900,"supplier":"Supplier A","commissionPct":13},
  {"name":"The Imperial","price":7200,"supplier":"Supplier B","commissionPct":15}
]
```

## How it works

```text
HTTP GET /api/hotels
      |
      v
Temporal workflow (execute & await result)
      | \
      |  \---- Activity: fetch Supplier B ---- HTTP /supplierB/hotels
      +------- Activity: fetch Supplier A ---- HTTP /supplierA/hotels
      |
      v
Merge overlapping names (choose lower price, tie -> Supplier A)
      |
      v
Activity: persistHotels -> Redis MULTI/EXEC:
      ZSET hotels:<city>:prices (score = price, member = normalized hotel name)
      HASH hotels:<city>:details (field = normalized hotel name, value = JSON)
      |
      v
API calls Redis ZRANGEBYSCORE (optional min/max), HMGET details
      |
      v
HTTP JSON response
```

The supplier activities run concurrently using `Promise.allSettled`; if one fails after retries, results from the other are still served. If **both** fail, the request returns HTTP 503. Logs are emitted for failed suppliers. Workflow execution is capped at 30 seconds, and activities retry twice with timeouts.

**Data freshness:** Each GET runs a new Temporal workflow and replaces the Redis city snapshot before querying Redis. This is intentionally simple; concurrent requests for the **same** city can replace each other's snapshot, though the provided static supplier data makes results equivalent. For concurrent, live supplier data use versioned keys/locking. There is no response cache TTL in this demonstration.

**Deduplication:** Name comparison is case-insensitive after trimming spaces; prices are authoritative, not commission percentages. A same-price tie favors Supplier A.

## Tests

```bash
npm install --no-audit --no-fund
npm test
npm run typecheck
```

Unit tests exercise overlap, price ties and empty results. For integration tests start the containers and import `postman/Hotel-Offer-Orchestrator.postman_collection.json` into Postman. Or run the collection via Newman.

## Simulate supplier outage (optional)

```bash
SUPPLIER_A_DOWN=true docker compose up --build -d --force-recreate api
curl 'http://localhost:3000/health'
curl 'http://localhost:3000/api/hotels?city=delhi'
SUPPLIER_A_DOWN=false docker compose up -d --force-recreate api
```

The worker accesses the supplier endpoints through the API service. When A is down, B-only results are returned. To simulate both down, set both `SUPPLIER_A_DOWN=true` and `SUPPLIER_B_DOWN=true` for the API container.

## Run without Compose (advanced)

Start Redis on port 6379 and a Temporal development server on port 7233, then:

```bash
npm install --no-audit --no-fund
npm run build
npm run start:api  # terminal 1
npm run start:worker # terminal 2
```

Default `SUPPLIER_BASE_URL=http://localhost:3000`. Override `TEMPORAL_ADDRESS`, `REDIS_URL`, `PORT`, and `SUPPLIER_BASE_URL` as required.

## Submission

Push the project folder to your GitHub repository:

```bash
git init
git add .
git commit -m "Implement hotel offer orchestrator"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/hotel-offer-orchestrator.git
git push -u origin main
```

No external GitHub repository is automatically created by this archive.
