import { eq } from 'drizzle-orm';
import { Router } from 'express';

import type { DatabaseConnection } from '../database/client.js';
import { financeSettings } from '../database/schema.js';
import { fromCents, toCents } from '../finance/currency.js';

// Story 34's global `financeSettings` singleton row's fixed id - there is
// exactly one row, so no client-supplied id is ever needed.
const FINANCE_SETTINGS_ID = 'singleton';

interface FinanceSettingsRow {
  id: string;
  wagePerHourCents: number;
  errorMarginPercent: number;
  salesTaxPercent: number;
  designingReferenceMinutes: number;
  designingReferencePages: number;
  printingReferenceMinutes: number;
  // Nullable (amended after story 34 shipped): Printing is a flat,
  // one-time cost for the whole binder that doesn't scale with page
  // count, so it has no referencePages - see the schema's own comment.
  printingReferencePages: number | null;
  applyingHolographicPaperReferenceMinutes: number;
  applyingHolographicPaperReferencePages: number;
  cuttingReferenceMinutes: number;
  cuttingReferencePages: number;
  placingReferenceMinutes: number;
  placingReferencePages: number;
  updatedAt: string;
}

interface TimeCostRateBasis {
  referenceMinutes?: number;
  referencePages?: number;
}

// The validated, OpenAPI-typed shape of a `PATCH /finance-settings` request
// body: every field (and every nested time-cost category's own fields) is
// independently optional, merged against the currently persisted row.
interface UpdateFinanceSettingsRequestBody {
  wagePerHour?: number;
  errorMarginPercent?: number;
  salesTaxPercent?: number;
  timeCosts?: {
    designing?: TimeCostRateBasis;
    printing?: TimeCostRateBasis;
    applyingHolographicPaper?: TimeCostRateBasis;
    cutting?: TimeCostRateBasis;
    placing?: TimeCostRateBasis;
  };
}

// Converts a persisted `financeSettings` row into the documented
// `FinanceSettings` REST shape: the 5 fixed time-cost categories nested
// under `timeCosts` (matching planning.md's `designing`/`printing`/
// `applyingHolographicPaper`/`cutting`/`placing` enum) rather than the
// flat, category-prefixed column names the database uses.
function toFinanceSettingsResponse(row: FinanceSettingsRow) {
  return {
    wagePerHour: fromCents(row.wagePerHourCents),
    errorMarginPercent: row.errorMarginPercent,
    salesTaxPercent: row.salesTaxPercent,
    timeCosts: {
      designing: {
        referenceMinutes: row.designingReferenceMinutes,
        referencePages: row.designingReferencePages,
      },
      printing: {
        referenceMinutes: row.printingReferenceMinutes,
        referencePages: row.printingReferencePages,
      },
      applyingHolographicPaper: {
        referenceMinutes: row.applyingHolographicPaperReferenceMinutes,
        referencePages: row.applyingHolographicPaperReferencePages,
      },
      cutting: {
        referenceMinutes: row.cuttingReferenceMinutes,
        referencePages: row.cuttingReferencePages,
      },
      placing: {
        referenceMinutes: row.placingReferenceMinutes,
        referencePages: row.placingReferencePages,
      },
    },
    updatedAt: row.updatedAt,
  };
}

// Story 34: the global finance-settings singleton (wage-per-hour, the
// shared error-margin percentage, and each of the 5 fixed time-cost
// categories' own rate basis) is exposed through one `GET`/`PATCH`
// endpoint pair, rather than 5+ separate CRUD resources - it's never tied
// to one binder, so every binder's Finances tab reads/writes this same
// resource. Never restricted by any binder's lock state, since it isn't
// scoped to a binder at all.
export function createFinanceSettingsRouter(database: DatabaseConnection['database']): Router {
  const router = Router();

  router.get('/finance-settings', (_request, response) => {
    // The seed migration always inserts this row, so it's always present
    // in a correctly migrated database.
    const settingsRow = database
      .select()
      .from(financeSettings)
      .where(eq(financeSettings.id, FINANCE_SETTINGS_ID))
      .get() as FinanceSettingsRow | undefined;

    if (!settingsRow) {
      response.status(500).type('application/problem+json').json({
        type: 'about:blank',
        title: 'Internal Server Error',
        status: 500,
        detail: 'The finance-settings singleton row is missing.',
      });
      return;
    }

    response.status(200).json(toFinanceSettingsResponse(settingsRow));
  });

  router.patch('/finance-settings', (request, response) => {
    const body = request.body as UpdateFinanceSettingsRequestBody;

    const existing = database
      .select()
      .from(financeSettings)
      .where(eq(financeSettings.id, FINANCE_SETTINGS_ID))
      .get() as FinanceSettingsRow | undefined;
    if (!existing) {
      response.status(500).type('application/problem+json').json({
        type: 'about:blank',
        title: 'Internal Server Error',
        status: 500,
        detail: 'The finance-settings singleton row is missing.',
      });
      return;
    }

    const updates: Partial<FinanceSettingsRow> = {};
    if (body.wagePerHour !== undefined) updates.wagePerHourCents = toCents(body.wagePerHour);
    if (body.errorMarginPercent !== undefined) {
      updates.errorMarginPercent = body.errorMarginPercent;
    }
    if (body.salesTaxPercent !== undefined) {
      updates.salesTaxPercent = body.salesTaxPercent;
    }

    // Each category's `referenceMinutes`/`referencePages` are independently
    // optional; only the fields actually included in the request are
    // merged onto the existing row's own column pair.
    const categoryColumnPrefixes = {
      designing: 'designing',
      printing: 'printing',
      applyingHolographicPaper: 'applyingHolographicPaper',
      cutting: 'cutting',
      placing: 'placing',
    } as const;
    (Object.keys(categoryColumnPrefixes) as (keyof typeof categoryColumnPrefixes)[]).forEach(
      (category) => {
        const patch = body.timeCosts?.[category];
        if (!patch) return;
        const prefix = categoryColumnPrefixes[category];
        if (patch.referenceMinutes !== undefined) {
          (updates as Record<string, number>)[`${prefix}ReferenceMinutes`] = patch.referenceMinutes;
        }
        if (patch.referencePages !== undefined) {
          (updates as Record<string, number>)[`${prefix}ReferencePages`] = patch.referencePages;
        }
      },
    );

    updates.updatedAt = new Date().toISOString();

    const updated = database
      .update(financeSettings)
      .set(updates)
      .where(eq(financeSettings.id, FINANCE_SETTINGS_ID))
      .returning()
      .get() as FinanceSettingsRow;

    response.status(200).json(toFinanceSettingsResponse(updated));
  });

  return router;
}
