import type { Card } from '@/lib/api';

// Story 50: finds the oldest `priceUpdatedAt` among every card that
// currently has a saved price, so the "View Financials" tab's Cards
// section can warn the user how stale its totals might be before they
// trust them. Cards that have never had a price (`price` and
// `priceUpdatedAt` both `null`) are excluded from this calculation
// entirely; returns `null` when no card in the binder has ever had a
// price, which the section displays as `--`.
export function computeOldestPriceRefresh(cards: readonly Card[]): string | null {
  let oldest: string | null = null;

  for (const card of cards) {
    if (card.priceUpdatedAt === null) continue;
    // ISO 8601 timestamps (as the backend always produces) sort correctly
    // with plain string comparison, so no `Date` parsing is needed here.
    if (oldest === null || card.priceUpdatedAt < oldest) {
      oldest = card.priceUpdatedAt;
    }
  }

  return oldest;
}
