import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeOffers } from '../src/utils/merge';
import type { SupplierResult } from '../src/types';
import { supplierA, supplierB } from '../src/data/suppliers';

test('selects cheaper overlap and includes unique hotels', () => {
  const entries: SupplierResult[] = [
    { supplier: 'Supplier A', hotels: supplierA.filter((h) => h.city === 'delhi') },
    { supplier: 'Supplier B', hotels: supplierB.filter((h) => h.city === 'delhi') },
  ];
  assert.deepEqual(mergeOffers(entries), [
    { name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 },
    { name: 'Radison', price: 5900, supplier: 'Supplier A', commissionPct: 13 },
    { name: 'The Imperial', price: 7200, supplier: 'Supplier B', commissionPct: 15 },
    { name: 'Taj Palace', price: 8500, supplier: 'Supplier A', commissionPct: 12 },
  ]);
});

test('deduplicates case-insensitively and favors supplier A on tied price', () => {
  const result = mergeOffers([
    { supplier: 'Supplier B', hotels: [{ hotelId: 'b', name: ' HOLTin ', price: 100, city: 'delhi', commissionPct: 20 }] },
    { supplier: 'Supplier A', hotels: [{ hotelId: 'a', name: 'holtin', price: 100, city: 'delhi', commissionPct: 10 }] },
  ]);
  assert.deepEqual(result, [{ name: 'holtin', price: 100, supplier: 'Supplier A', commissionPct: 10 }]);
});

test('empty supplier results yield empty output', () => {
  assert.deepEqual(mergeOffers([{ supplier: 'Supplier A', hotels: [] }]), []);
});
