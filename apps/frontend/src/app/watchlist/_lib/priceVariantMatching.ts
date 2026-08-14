import type { CardPriceVariant } from '@/lib/api';

// Story 45's What I'm Looking For page reuses story 38's default-variant-
// selection logic verbatim - copied here (rather than imported cross-route
// from the Card List tab's own `_lib`) since this pure function has no
// `Card`/binder coupling and this codebase scopes each route's `_lib` to
// its own route. See `cardlist/_lib/priceVariantMatching.ts` for the
// canonical copy/its own detailed comments.
const VARIANT_KEYWORD_PREFERENCES: ReadonlyArray<{ keywords: string[]; variantKey: string }> = [
  { keywords: ['reverse'], variantKey: 'reverseHolofoil' },
  { keywords: ['1st', 'first'], variantKey: '1stEditionHolofoil' },
  { keywords: ['holo'], variantKey: 'holofoil' },
];

export function deriveDefaultVariantKey(
  variation: string | null,
  variants: readonly CardPriceVariant[],
): string | null {
  if (variants.length === 0) return null;

  const availableKeys = new Set(variants.map((variant) => variant.variantKey));
  const normalizedVariation = (variation ?? '').toLowerCase();

  for (const { keywords, variantKey } of VARIANT_KEYWORD_PREFERENCES) {
    if (
      availableKeys.has(variantKey) &&
      keywords.some((keyword) => normalizedVariation.includes(keyword))
    ) {
      return variantKey;
    }
  }

  if (availableKeys.has('normal')) return 'normal';
  return variants[0]!.variantKey;
}
