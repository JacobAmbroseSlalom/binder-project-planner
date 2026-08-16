import { fromCents } from '../../finance/currency.js';
import type { CardPriceFetchResult } from '../../integrations/pokemontcg/index.js';

import type { CardRow } from './types.js';

// Shared Problem Details (RFC 9457) body builder, used by every card route.
export function problem(status: number, title: string, detail: string) {
  return { type: 'about:blank', title, status, detail };
}

// Converts pokemontcg.io price-fetch results (internal, cents-based) into
// the OpenAPI `CardPriceFetchResult` response shape (decimal dollars),
// matching `serializeCard`'s own cents-to-dollars boundary conversion.
export function serializeCardPriceFetchResults(results: CardPriceFetchResult[]) {
  return results.map((result) => ({
    cardId: result.cardId,
    tcgplayerUrl: result.tcgplayerUrl,
    variants: result.variants.map((variant) => ({
      variantKey: variant.variantKey,
      marketPrice: variant.marketPriceCents === null ? null : fromCents(variant.marketPriceCents),
      lowPrice: variant.lowPriceCents === null ? null : fromCents(variant.lowPriceCents),
    })),
  }));
}

// Serializes a persisted card row as the OpenAPI `Card` response shape. The
// image URL is always the backend's own streaming endpoint, never the
// provider's - storage details and provider URLs are never exposed.
export function serializeCard(row: CardRow) {
  return {
    id: row.id,
    binderId: row.binderId,
    name: row.name,
    setName: row.setName,
    localNumber: row.localNumber,
    source: row.source,
    providerCardId: row.providerCardId,
    providerSetId: row.providerSetId,
    variation: row.variation,
    placement: { physicalPage: row.physicalPage, row: row.row, column: row.column },
    imageUrl: `/cards/${row.id}/image`,
    acquired: row.acquired,
    // Story 38: converts the internally-stored integer cents back to
    // decimal dollars at the API boundary (`finance/currency.ts`'s
    // convention); null (never fetched or entered) passes through as-is.
    price: row.priceCents === null ? null : fromCents(row.priceCents),
    isManualPrice: row.isManualPrice,
    priceUpdatedAt: row.priceUpdatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
