import { COST_ENTRY_NAME_MAX_LENGTH } from '@binder-project-planner/shared';

import type { DatabaseConnection } from '../../database/client.js';

// Shared dependencies every cost-entries route needs - mirrors
// routes/binders/types.ts's `BindersRouteDeps` pattern for this codebase's
// flat-domain-folder backend split convention (story 48). No
// `imagesDirectory` is needed here since none of these 3 catalogs own
// images.
export interface CostEntriesRouteDeps {
  database: DatabaseConnection['database'];
}

// Minimal RFC 7807 Problem Details body, shared by every catalog's error
// responses below.
export function problem(status: number, title: string, detail: string) {
  return { type: 'about:blank', title, status, detail };
}

// Trims and validates a cost entry's `name` field, shared by all 3
// catalogs (story 34: "Add custom art finances"). Duplicate names across
// entries are allowed - selection is by id, not name - so this only checks
// length after trimming.
export function validateName(name: string): { value: string } | { error: string } {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > COST_ENTRY_NAME_MAX_LENGTH) {
    return {
      error: `name must be between 1 and ${COST_ENTRY_NAME_MAX_LENGTH} characters after trimming.`,
    };
  }
  return { value: trimmed };
}
