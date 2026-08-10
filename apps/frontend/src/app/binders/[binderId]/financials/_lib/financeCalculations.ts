// Story 34's pure cost-calculation helpers, shared by every section of the
// "View Financials" tab. None of these totals are persisted - they're all
// derived from stored rate/quantity data (shared cost entries, shared
// time-cost rate bases, the shared wage-per-hour value, this binder's
// art-print page count, and the error-margin percentage) at render time,
// per this story's technical requirements. Colocated here (rather than
// `packages/shared`) since these are runtime-calculated values, not
// application-owned defaults.
import type { TimeCosts } from '@/lib/api';

// Rounds a dollar amount to the nearest cent using round-half-up, matching
// normal money display. `Math.round` already rounds halves up (not to
// even) for the positive values every cost in this app produces.
export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

// Rounds an hours value to 2 decimal places for display, also round-half-up.
export function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

// Formats an already-rounded dollar amount for display (e.g. `$12.50`).
export function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

// The number of extra whole pages the error margin adds, rounded up, to
// account for pages that must be redone due to human error.
export function computeExtraPages(pageCount: number, errorMarginPercent: number): number {
  return Math.ceil((pageCount * errorMarginPercent) / 100);
}

// The "With Tax" sticky-totals figure: the shared sales-tax percentage
// applied on top of "Total (excl. Cards)" (defaults to Georgia's flat
// state sales tax rate, but is editable the same way as errorMarginPercent
// and wagePerHour).
export function computeWithTax(totalExcludingCards: number, salesTaxPercent: number): number {
  return roundCents(totalExcludingCards * (1 + salesTaxPercent / 100));
}

export interface MarginedCost {
  withoutMargin: number;
  withMargin: number;
}

// The Printing physical cost: price-per-page multiplied by the binder's
// art-print page count, with and without the error-margin-extended page
// count.
export function computePrintingCost(
  pricePerPage: number,
  pageCount: number,
  errorMarginPercent: number,
): MarginedCost {
  const extraPages = computeExtraPages(pageCount, errorMarginPercent);
  return {
    withoutMargin: roundCents(pricePerPage * pageCount),
    withMargin: roundCents(pricePerPage * (pageCount + extraPages)),
  };
}

// The Holographic Paper physical cost: (price / pagesIncluded) - the
// effective per-page price - multiplied by the binder's art-print page
// count, with and without the error-margin-extended page count.
export function computeHolographicPaperCost(
  price: number,
  pagesIncluded: number,
  pageCount: number,
  errorMarginPercent: number,
): MarginedCost {
  const pricePerPage = price / pagesIncluded;
  const extraPages = computeExtraPages(pageCount, errorMarginPercent);
  return {
    withoutMargin: roundCents(pricePerPage * pageCount),
    withMargin: roundCents(pricePerPage * (pageCount + extraPages)),
  };
}

export interface TimeCostResult {
  hours: number;
  price: number;
}

// One time-cost category's total hours and price for this binder. When
// `referencePages` is null (currently only Printing), the category is a
// flat, one-time cost that doesn't scale with page count, so
// `referenceMinutes` is used directly as the binder's total minutes.
// Otherwise, `referenceMinutes / referencePages * pageCount` gives total
// minutes, converted to hours; the price is computed from the unrounded
// hours value and only the resulting price is then rounded, per this
// story's rounding requirements.
export function computeTimeCost(
  rateBasis: { referenceMinutes: number; referencePages: number | null },
  pageCount: number,
  wagePerHour: number,
): TimeCostResult {
  const totalMinutes =
    rateBasis.referencePages === null
      ? rateBasis.referenceMinutes
      : (rateBasis.referenceMinutes / rateBasis.referencePages) * pageCount;
  const hours = totalMinutes / 60;
  return {
    hours: roundHours(hours),
    price: roundCents(hours * wagePerHour),
  };
}

// The 5 fixed time-cost categories baked into the schema (story 34) in
// display order, paired with their user-facing labels and whether the
// category scales with page count. `scalesWithPages: false` means this
// category's rate basis has no `referencePages` field (it's always null)
// and its cost is a flat, one-time cost for the whole binder - currently
// only Printing.
export const TIME_COST_CATEGORIES = [
  { key: 'designing', label: 'Binder Designing', scalesWithPages: true },
  { key: 'printing', label: 'Printing', scalesWithPages: false },
  { key: 'applyingHolographicPaper', label: 'Applying Holographic Paper', scalesWithPages: true },
  { key: 'cutting', label: 'Cutting', scalesWithPages: true },
  { key: 'placing', label: 'Placing', scalesWithPages: true },
] as const satisfies readonly { key: keyof TimeCosts; label: string; scalesWithPages: boolean }[];
