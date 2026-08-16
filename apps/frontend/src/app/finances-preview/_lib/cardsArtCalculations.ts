// Shared "Cards & Art" section math (story 54), used by both the section's
// own component (rendering each row's contribution and the total-slots
// summary) and the page itself (deriving a pages-of-art estimate from the
// same total-cards figure) - promoted out of `PreviewCardsArtSection.tsx`
// once the page component became a second consumer.

// Parses one row's count field: blank or invalid counts contribute 0 to
// the total rather than being rejected, since this section has no
// validation/persistence to protect (story 54: purely cosmetic rows).
export function parseCardCount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}
