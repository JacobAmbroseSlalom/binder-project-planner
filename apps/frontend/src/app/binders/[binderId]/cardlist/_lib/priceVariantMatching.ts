import type { CardPriceVariant } from '@/lib/api';

// Story 38's default-variant-selection keyword preferences, checked in
// this fixed priority order against a card's saved `variation` string
// (case-insensitive substring match) - "reverse" is checked ahead of
// "holo" so a "Reverse Holo" variation selects `reverseHolofoil` rather
// than falling through to plain `holofoil`.
const VARIANT_KEYWORD_PREFERENCES: ReadonlyArray<{ keywords: string[]; variantKey: string }> = [
  { keywords: ['reverse'], variantKey: 'reverseHolofoil' },
  { keywords: ['1st', 'first'], variantKey: '1stEditionHolofoil' },
  { keywords: ['holo'], variantKey: 'holofoil' },
];

// A card's default variant selection (story 38's acceptance criteria):
// matches its saved `variation` against `VARIANT_KEYWORD_PREFERENCES`,
// falls back to `normal` when nothing matches, then to the first
// available variant key if `normal` isn't present either. Returns `null`
// only when the card has no variants at all (couldn't be matched to a
// pokemontcg.io card, or that card has no price data).
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
