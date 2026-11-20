import type { HotelOffer, SupplierResult } from '../types';

/** Deterministic: lowest price wins; ties favor Supplier A, then first seen. */
export function mergeOffers(results: SupplierResult[]): HotelOffer[] {
  const winners = new Map<string, HotelOffer>();
  for (const result of results) {
    for (const hotel of result.hotels) {
      const name = hotel.name.trim();
      const key = name.toLocaleLowerCase('en-US');
      if (!name || !Number.isFinite(hotel.price) || hotel.price < 0) continue;
      const candidate: HotelOffer = {
        name,
        price: hotel.price,
        supplier: result.supplier,
        commissionPct: hotel.commissionPct,
      };
      const current = winners.get(key);
      if (!current || candidate.price < current.price ||
          (candidate.price === current.price && candidate.supplier === 'Supplier A' && current.supplier !== 'Supplier A')) {
        winners.set(key, candidate);
      }
    }
  }
  return [...winners.values()].sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
}
