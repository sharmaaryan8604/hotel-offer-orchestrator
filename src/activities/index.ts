import { env } from '../config/env';
import { saveHotels } from '../redis/store';
import type { HotelOffer, SupplierHotel } from '../types';

async function fetchSupplier(path: string, city: string): Promise<SupplierHotel[]> {
  const url = new URL(path, env.supplierBaseUrl);
  url.searchParams.set('city', city);
  const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error(`${path} returned an invalid response`);
  // Mock APIs are part of this service. Strict validation protects the workflow from malformed data.
  if (!payload.every((h) => h && typeof h === 'object' &&
      typeof h.name === 'string' && typeof h.price === 'number' &&
      Number.isFinite(h.price) && h.price >= 0 && typeof h.commissionPct === 'number')) {
    throw new Error(`${path} returned invalid hotel items`);
  }
  return payload as SupplierHotel[];
}

export async function fetchSupplierA(city: string): Promise<SupplierHotel[]> {
  return fetchSupplier('/supplierA/hotels', city);
}

export async function fetchSupplierB(city: string): Promise<SupplierHotel[]> {
  return fetchSupplier('/supplierB/hotels', city);
}

export async function persistHotels(city: string, hotels: HotelOffer[]): Promise<void> {
  await saveHotels(city, hotels);
}
