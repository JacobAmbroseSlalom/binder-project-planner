import { apiClient } from './client';
import type { FinanceSettings, UpdateFinanceSettingsRequest } from './types';

// Story 34: fetches the global finance-settings singleton through
// `GET /finance-settings` - never scoped to a binder, so there's no
// binderId parameter here.
export async function getFinanceSettings(signal?: AbortSignal): Promise<FinanceSettings> {
  const { data, error } = await apiClient.GET('/finance-settings', { signal });

  if (error) {
    throw error;
  }

  return data;
}

// Applies a partial update to the finance-settings singleton through
// `PATCH /finance-settings` (story 34). Throws the Problem Details body on
// failure so callers (via `useSaveStatusToast`/`toProblemDetailsInfo`) can
// read its `detail`, `status`, and `type` fields directly.
export async function updateFinanceSettings(
  patch: UpdateFinanceSettingsRequest,
): Promise<FinanceSettings> {
  const { data, error } = await apiClient.PATCH('/finance-settings', { body: patch });

  if (error) {
    throw error;
  }

  return data;
}
