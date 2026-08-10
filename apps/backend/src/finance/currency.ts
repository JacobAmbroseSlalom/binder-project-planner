// Story 34: "Add custom art finances". Currency values (`price`,
// `pricePerPage`, `wagePerHour`, and every computed total) are stored in
// the database as integer cents, matching the existing centimeter/
// percentage integer-hundredths convention elsewhere in the backend, while
// REST contracts use human-readable decimal dollars (e.g. `12.50`). These
// two helpers convert between the two representations at the API boundary,
// mirroring routes/binders.ts's own `toHundredths`/`fromHundredths` pair.
// `Math.round` already rounds half-up for the non-negative dollar amounts
// this app deals with, matching the story's documented rounding rule.
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}
