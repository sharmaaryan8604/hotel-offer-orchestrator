import { createClient } from 'redis';
import { env } from '../config/env';
import type { HotelOffer } from '../types';

export const redis = createClient({ url: env.redisUrl });
redis.on('error', (error) => console.error('[redis]', error));

function keys(city: string) {
  return { prices: `hotels:${city}:prices`, details: `hotels:${city}:details` };
}

/** Replace the complete city snapshot atomically. A ZSET keeps prices searchable in Redis. */
export async function saveHotels(city: string, hotels: HotelOffer[]): Promise<void> {
  const { prices, details } = keys(city);
  const tx = redis.multi().del(prices).del(details);
  for (const hotel of hotels) {
    const member = hotel.name.toLocaleLowerCase('en-US');
    tx.zAdd(prices, { score: hotel.price, value: member });
    tx.hSet(details, member, JSON.stringify(hotel));
  }
  await tx.exec();
}

/** Price filtering runs server-side with Redis ZRANGEBYSCORE, not in JavaScript. */
export async function findHotels(city: string, minPrice = 0, maxPrice = Infinity): Promise<HotelOffer[]> {
  const { prices, details } = keys(city);
  const min = Number.isFinite(minPrice) ? minPrice : '-inf';
  const max = Number.isFinite(maxPrice) ? maxPrice : '+inf';
  const names = await redis.zRangeByScore(prices, min, max);
  if (!names.length) return [];
  const raw = await redis.hmGet(details, names);
  return raw.filter((value): value is string => value !== null).map((value) => JSON.parse(value) as HotelOffer);
}
