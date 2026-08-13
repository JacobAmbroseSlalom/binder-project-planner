// Formats an already-rounded dollar amount for display (e.g. `$12.50`) -
// shared by the "View Financials" tab's cost calculations and the Card
// List tab's price totals (story 38), since both need the same plain
// currency display with no rounding of their own.
export function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}
