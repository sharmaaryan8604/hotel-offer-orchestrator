import { proxyActivities, log } from '@temporalio/workflow';
import type * as activities from '../activities';
import type { HotelOffer, SupplierResult } from '../types';
import { mergeOffers } from '../utils/merge';

const { fetchSupplierA, fetchSupplierB, persistHotels } = proxyActivities<typeof activities>({
  startToCloseTimeout: '8 seconds',
  retry: { maximumAttempts: 2, initialInterval: '500 milliseconds' },
});

export async function hotelOffersWorkflow(city: string): Promise<HotelOffer[]> {
  // Both supplier calls are scheduled immediately, before waiting on either.
  const [a, b] = await Promise.allSettled([fetchSupplierA(city), fetchSupplierB(city)]);
  const successful: SupplierResult[] = [];
  if (a.status === 'fulfilled') successful.push({ supplier: 'Supplier A', hotels: a.value });
  else log.warn('Supplier A unavailable', { city, error: String(a.reason) });
  if (b.status === 'fulfilled') successful.push({ supplier: 'Supplier B', hotels: b.value });
  else log.warn('Supplier B unavailable', { city, error: String(b.reason) });
  if (successful.length === 0) throw new Error(`Both suppliers unavailable for ${city}`);

  const hotels = mergeOffers(successful);
  await persistHotels(city, hotels);
  return hotels;
}
