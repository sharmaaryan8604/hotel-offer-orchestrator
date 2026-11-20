import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Client, Connection } from '@temporalio/client';
import { env } from './config/env';
import { supplierA, supplierB } from './data/suppliers';
import { findHotels, redis } from './redis/store';
import { hotelOffersWorkflow } from './temporal/workflows';

const app = express();
app.disable('x-powered-by');

function serveMock(hotels: typeof supplierA, down: boolean, req: Request, res: Response) {
  if (down) { res.status(503).json({ error: 'Supplier unavailable' }); return; }
  const city = String(req.query.city ?? '').trim().toLowerCase();
  res.json(city ? hotels.filter((hotel) => hotel.city === city) : hotels);
}

app.get('/supplierA/hotels', (req, res) => serveMock(supplierA, process.env.SUPPLIER_A_DOWN === 'true', req, res));
app.get('/supplierB/hotels', (req, res) => serveMock(supplierB, process.env.SUPPLIER_B_DOWN === 'true', req, res));

function priceParam(raw: unknown): number | undefined | null {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || raw.trim() === '' || !Number.isFinite(Number(raw)) || Number(raw) < 0) return null;
  return Number(raw);
}

let temporalClient: Client;
app.get('/api/hotels', async (req, res) => {
  const city = req.query.city;
  if (typeof city !== 'string' || !/^[a-z][a-z\s-]{0,79}$/i.test(city.trim())) {
    res.status(400).json({ error: 'city must be a non-empty city name' }); return;
  }
  const normalizedCity = city.trim().toLowerCase();
  const min = priceParam(req.query.minPrice);
  const max = priceParam(req.query.maxPrice);
  if (min === null || max === null || (min !== undefined && max !== undefined && min > max)) {
    res.status(400).json({ error: 'Prices must be nonnegative numbers with minPrice <= maxPrice' }); return;
  }
  try {
    // Always refresh the Redis snapshot through Temporal; no stale filtered results.
    await temporalClient.workflow.execute(hotelOffersWorkflow, {
      taskQueue: env.taskQueue,
      workflowId: `hotel-${normalizedCity}-${randomUUID()}`,
      args: [normalizedCity],
      workflowExecutionTimeout: '30 seconds',
    });
    const hotels = await findHotels(normalizedCity, min ?? 0, max ?? Infinity);
    res.json(hotels);
  } catch (error) {
    console.error('[api] Hotel orchestration failed:', error);
    res.status(503).json({ error: 'Unable to retrieve hotel offers; try again later' });
  }
});

app.get('/health', async (_req, res) => {
  const [a, b, r] = await Promise.allSettled([
    fetch(new URL('/supplierA/hotels', env.supplierBaseUrl), { signal: AbortSignal.timeout(2500) }),
    fetch(new URL('/supplierB/hotels', env.supplierBaseUrl), { signal: AbortSignal.timeout(2500) }),
    redis.ping(),
  ]);
  const suppliers = {
    supplierA: a.status === 'fulfilled' && a.value.ok ? 'up' : 'down',
    supplierB: b.status === 'fulfilled' && b.value.ok ? 'up' : 'down',
  };
  const redisStatus = r.status === 'fulfilled' && r.value === 'PONG' ? 'up' : 'down';
  res.status(redisStatus === 'up' && (suppliers.supplierA === 'up' || suppliers.supplierB === 'up') ? 200 : 503)
    .json({ status: redisStatus === 'up' && suppliers.supplierA === 'up' && suppliers.supplierB === 'up' ? 'healthy' : 'degraded', suppliers, redis: redisStatus });
});

async function main() {
  await redis.connect();
  const connection = await Connection.connect({ address: env.temporalAddress });
  temporalClient = new Client({ connection, namespace: env.temporalNamespace });
  const server = app.listen(env.port, '0.0.0.0', () => console.log(`API on http://localhost:${env.port}`));
  const shutdown = () => { server.close(); void redis.quit().finally(() => process.exit(0)); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
main().catch((error) => { console.error('API failed:', error); process.exit(1); });
