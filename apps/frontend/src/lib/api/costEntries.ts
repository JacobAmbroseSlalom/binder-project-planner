import { apiClient } from './client';
import type {
  BinderCostEntry,
  CreateBinderCostEntryRequest,
  CreateHolographicPaperCostEntryRequest,
  CreatePrintingCostEntryRequest,
  HolographicPaperCostEntry,
  PrintingCostEntry,
  UpdateBinderCostEntryRequest,
  UpdateHolographicPaperCostEntryRequest,
  UpdatePrintingCostEntryRequest,
} from './types';

// Story 34: the 3 shared physical-cost catalogs (Binder, Printing,
// Holographic Paper) are each global resources - never scoped to a
// binder - that a binder selects one entry from at most. Every list
// endpoint already returns entries alphabetically ordered by name
// (case-insensitive), so the frontend renders them as-is.

// --- Binder cost entries ---

export async function listBinderCostEntries(signal?: AbortSignal): Promise<BinderCostEntry[]> {
  const { data, error } = await apiClient.GET('/binder-cost-entries', { signal });

  if (error) {
    throw error;
  }

  return data;
}

export async function createBinderCostEntry(
  request: CreateBinderCostEntryRequest,
): Promise<BinderCostEntry> {
  const { data, error } = await apiClient.POST('/binder-cost-entries', { body: request });

  if (error) {
    throw error;
  }

  return data;
}

export async function updateBinderCostEntry(
  binderCostEntryId: string,
  patch: UpdateBinderCostEntryRequest,
): Promise<BinderCostEntry> {
  const { data, error } = await apiClient.PATCH('/binder-cost-entries/{binderCostEntryId}', {
    params: { path: { binderCostEntryId } },
    body: patch,
  });

  if (error) {
    throw error;
  }

  return data;
}

// --- Printing cost entries ---

export async function listPrintingCostEntries(signal?: AbortSignal): Promise<PrintingCostEntry[]> {
  const { data, error } = await apiClient.GET('/printing-cost-entries', { signal });

  if (error) {
    throw error;
  }

  return data;
}

export async function createPrintingCostEntry(
  request: CreatePrintingCostEntryRequest,
): Promise<PrintingCostEntry> {
  const { data, error } = await apiClient.POST('/printing-cost-entries', { body: request });

  if (error) {
    throw error;
  }

  return data;
}

export async function updatePrintingCostEntry(
  printingCostEntryId: string,
  patch: UpdatePrintingCostEntryRequest,
): Promise<PrintingCostEntry> {
  const { data, error } = await apiClient.PATCH('/printing-cost-entries/{printingCostEntryId}', {
    params: { path: { printingCostEntryId } },
    body: patch,
  });

  if (error) {
    throw error;
  }

  return data;
}

// --- Holographic Paper cost entries ---

export async function listHolographicPaperCostEntries(
  signal?: AbortSignal,
): Promise<HolographicPaperCostEntry[]> {
  const { data, error } = await apiClient.GET('/holographic-paper-cost-entries', { signal });

  if (error) {
    throw error;
  }

  return data;
}

export async function createHolographicPaperCostEntry(
  request: CreateHolographicPaperCostEntryRequest,
): Promise<HolographicPaperCostEntry> {
  const { data, error } = await apiClient.POST('/holographic-paper-cost-entries', {
    body: request,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function updateHolographicPaperCostEntry(
  holographicPaperCostEntryId: string,
  patch: UpdateHolographicPaperCostEntryRequest,
): Promise<HolographicPaperCostEntry> {
  const { data, error } = await apiClient.PATCH(
    '/holographic-paper-cost-entries/{holographicPaperCostEntryId}',
    {
      params: { path: { holographicPaperCostEntryId } },
      body: patch,
    },
  );

  if (error) {
    throw error;
  }

  return data;
}
