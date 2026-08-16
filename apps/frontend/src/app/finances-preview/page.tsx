'use client';

import { getTotalSlots } from '@binder-project-planner/shared';
import { useCallback, useEffect, useState } from 'react';

import {
  getFinanceSettings,
  listBinderCostEntries,
  listHolographicPaperCostEntries,
  listPrintingCostEntries,
  type FinanceSettings,
} from '@/lib/api';
import {
  LoadingIndicator,
  toProblemDetailsInfo,
  useDelayedLoading,
  useToastContext,
} from '@/shared/feedback';

import { PreviewCardsArtSection } from './_components/PreviewCardsArtSection';
import { PreviewMaterialCostsSection } from './_components/PreviewMaterialCostsSection';
import { PreviewStickyTotals } from './_components/PreviewStickyTotals';
import { PreviewTimeCostsSection } from './_components/PreviewTimeCostsSection';
import {
  computeHolographicPaperCost,
  computePrintingCost,
  computeTimeCost,
  computeWithTax,
  TIME_COST_CATEGORIES,
} from '../binders/[binderId]/financials/_lib/financeCalculations';
import { parseCardCount } from './_lib/cardsArtCalculations';
import type {
  CardCountRow,
  PreviewBinderCostEntryOption,
  PreviewHolographicPaperCostEntryOption,
  PreviewPrintingCostEntryOption,
} from './_lib/previewTypes';

// Fixed toast id for this page's own combined load, matching the pattern
// used by the real "View Financials" tab's own load.
const LOAD_FINANCES_PREVIEW_TOAST_ID = 'load-finances-preview';

// This page's simplified pages-of-art estimate (see the `pageCount`
// derivation below): a flat assumption of how many art slots fit on one
// printed page, independent of the selected Binder cost entry's actual
// width/height - unlike the real "View Financials" tab, which packs real
// placed art via `computeArtPrintPacking` instead of assuming a fixed
// count.
const ART_SLOTS_PER_PRINTED_PAGE = 8;

type LoadStatus = 'loading' | 'success' | 'error';

// The "Finances Preview" page (story 54): a standalone estimate-cost
// calculator, reachable without creating a binder, that mirrors the real
// "View Financials" tab's Material costs, Time-based costs, and totals -
// with a "Cards & Art" section standing in for the real tab's per-card
// saved prices, since this page has no real cards to price. Every
// selection, edit, and "+ Add new…" catalog entry created here lives only
// in this page's own component state for the lifetime of the visit -
// nothing is ever sent back to the backend, and navigating away loses
// everything with no confirmation prompt, per this story's acceptance
// criteria.
export default function FinancesPreviewPage() {
  const { markFailed, dismiss } = useToastContext();
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [retryToken, setRetryToken] = useState(0);

  // Material costs: each catalog's options (seeded from the real shared
  // catalog on load, then extended locally by any "+ Add new…" entries
  // created on this page - those are never sent to the real `POST`
  // endpoints) plus which one is currently selected.
  const [binderEntries, setBinderEntries] = useState<PreviewBinderCostEntryOption[]>([]);
  const [selectedBinderEntryId, setSelectedBinderEntryId] = useState<string | null>(null);
  const [printingEntries, setPrintingEntries] = useState<PreviewPrintingCostEntryOption[]>([]);
  const [selectedPrintingEntryId, setSelectedPrintingEntryId] = useState<string | null>(null);
  const [holographicPaperEntries, setHolographicPaperEntries] = useState<
    PreviewHolographicPaperCostEntryOption[]
  >([]);
  const [selectedHolographicPaperEntryId, setSelectedHolographicPaperEntryId] = useState<
    string | null
  >(null);

  // Time-based costs and the shared sales-tax percentage: a local editable
  // copy seeded from the real `financeSettings` singleton on load. Edits
  // here never call `updateFinanceSettings` - they only change what's
  // displayed on this page.
  const [wagePerHour, setWagePerHour] = useState(0);
  const [errorMarginPercent, setErrorMarginPercent] = useState(0);
  const [salesTaxPercent, setSalesTaxPercent] = useState(0);
  const [timeCosts, setTimeCosts] = useState<FinanceSettings['timeCosts'] | null>(null);

  // Cards & Art: repeatable cosmetic label/count rows, starting with one
  // blank row.
  const [cardRows, setCardRows] = useState<CardCountRow[]>([
    { id: crypto.randomUUID(), label: '', count: '' },
  ]);

  const showLoading = useDelayedLoading(status === 'loading');

  const retry = useCallback(() => setRetryToken((token) => token + 1), []);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setStatus('loading');
      try {
        const [
          financeSettings,
          binderCostEntries,
          printingCostEntries,
          holographicPaperCostEntries,
        ] = await Promise.all([
          getFinanceSettings(controller.signal),
          listBinderCostEntries(controller.signal),
          listPrintingCostEntries(controller.signal),
          listHolographicPaperCostEntries(controller.signal),
        ]);

        setBinderEntries(
          binderCostEntries.map((entry) => ({
            id: entry.id,
            name: entry.name,
            price: entry.price,
            width: entry.width,
            height: entry.height,
            pages: entry.pages,
          })),
        );
        setPrintingEntries(
          printingCostEntries.map((entry) => ({
            id: entry.id,
            name: entry.name,
            pricePerPage: entry.pricePerPage,
          })),
        );
        setHolographicPaperEntries(
          holographicPaperCostEntries.map((entry) => ({
            id: entry.id,
            name: entry.name,
            price: entry.price,
            pagesIncluded: entry.pagesIncluded,
          })),
        );
        setWagePerHour(financeSettings.wagePerHour);
        setErrorMarginPercent(financeSettings.errorMarginPercent);
        setSalesTaxPercent(financeSettings.salesTaxPercent);
        setTimeCosts(financeSettings.timeCosts);

        setStatus('success');
        dismiss(LOAD_FINANCES_PREVIEW_TOAST_ID);
      } catch (error) {
        if (controller.signal.aborted) return;
        setStatus('error');
        markFailed(LOAD_FINANCES_PREVIEW_TOAST_ID, toProblemDetailsInfo(error));
      }
    }

    load();
    return () => controller.abort();
  }, [retryToken, markFailed, dismiss]);

  if (status === 'loading') {
    return showLoading ? <LoadingIndicator label="Loading finances preview…" size="10" /> : null;
  }

  if (status === 'error' || timeCosts === null) {
    return (
      <div className="flex flex-col items-center gap-4 p-8">
        <p className="text-body text-neutral-500">Finances preview could not be loaded.</p>
        <button
          type="button"
          onClick={retry}
          className="cursor-pointer rounded-standard bg-primary px-4 py-2 font-bold hover:brightness-110"
        >
          Retry
        </button>
      </div>
    );
  }

  const selectedBinderEntry =
    binderEntries.find((entry) => entry.id === selectedBinderEntryId) ?? null;
  const selectedPrintingEntry =
    printingEntries.find((entry) => entry.id === selectedPrintingEntryId) ?? null;
  const selectedHolographicPaperEntry =
    holographicPaperEntries.find((entry) => entry.id === selectedHolographicPaperEntryId) ?? null;

  // There's no real placed multi-slot art to derive a print-PDF page count
  // from (as the real "View Financials" tab does via `computeArtPrintPacking`),
  // so this page estimates it instead: total slots (from the selected/
  // created Binder cost entry's width/height/pages) minus the "Cards & Art"
  // section's own total card count leaves the slot count assumed to hold
  // art, and a flat `ART_SLOTS_PER_PRINTED_PAGE` slots' worth of art is
  // assumed to fit per printed page (ceiled up) - a simplification, not
  // the real bin-packing algorithm, since there's no real art to pack here.
  const totalSlots = selectedBinderEntry
    ? getTotalSlots(
        selectedBinderEntry.width,
        selectedBinderEntry.height,
        selectedBinderEntry.pages,
      )
    : 0;
  const totalCards = cardRows.reduce((sum, row) => sum + parseCardCount(row.count), 0);
  const artSlotsUsed = Math.max(0, totalSlots - totalCards);
  const pageCount = Math.ceil(artSlotsUsed / ART_SLOTS_PER_PRINTED_PAGE);

  const printingCost = selectedPrintingEntry
    ? computePrintingCost(selectedPrintingEntry.pricePerPage, pageCount, errorMarginPercent)
    : null;
  const holographicPaperCost = selectedHolographicPaperEntry
    ? computeHolographicPaperCost(
        selectedHolographicPaperEntry.price,
        selectedHolographicPaperEntry.pagesIncluded,
        pageCount,
        errorMarginPercent,
      )
    : null;

  const materialCostsTotal =
    (selectedBinderEntry?.price ?? 0) +
    (printingCost?.withMargin ?? 0) +
    (holographicPaperCost?.withMargin ?? 0);

  const timeCostResults = TIME_COST_CATEGORIES.map(({ key }) =>
    computeTimeCost(timeCosts[key], pageCount, wagePerHour),
  );
  const timeCostsTotal = timeCostResults.reduce((sum, result) => sum + result.price, 0);
  const totalHours = timeCostResults.reduce((sum, result) => sum + result.hours, 0);

  const total = materialCostsTotal + timeCostsTotal;
  const withTax = computeWithTax(total, salesTaxPercent);

  // The "Create binder" button's destination: prefills width/height/pages
  // from the selected/created Binder cost entry, or plain `/binders/new`
  // (its own normal defaults) when none has been picked yet.
  const createBinderHref = selectedBinderEntry
    ? `/binders/new?${new URLSearchParams({
        width: String(selectedBinderEntry.width),
        height: String(selectedBinderEntry.height),
        pages: String(selectedBinderEntry.pages),
      }).toString()}`
    : '/binders/new';

  return (
    <div className="flex flex-col gap-6 px-8 pb-8">
      <PreviewStickyTotals
        materialCostsTotal={materialCostsTotal}
        timeCostsTotal={timeCostsTotal}
        total={total}
        withTax={withTax}
        salesTaxPercent={salesTaxPercent}
        totalHours={totalHours}
        createBinderHref={createBinderHref}
      />
      <PreviewMaterialCostsSection
        binderEntries={binderEntries}
        selectedBinderEntryId={selectedBinderEntryId}
        onSelectBinderEntry={setSelectedBinderEntryId}
        onBinderEntryCreated={(entry) => {
          setBinderEntries((prev) => [...prev, entry]);
          setSelectedBinderEntryId(entry.id);
        }}
        onBinderEntryUpdated={(entry) =>
          setBinderEntries((prev) =>
            prev.map((existing) => (existing.id === entry.id ? entry : existing)),
          )
        }
        printingEntries={printingEntries}
        selectedPrintingEntryId={selectedPrintingEntryId}
        onSelectPrintingEntry={setSelectedPrintingEntryId}
        onPrintingEntryCreated={(entry) => {
          setPrintingEntries((prev) => [...prev, entry]);
          setSelectedPrintingEntryId(entry.id);
        }}
        onPrintingEntryUpdated={(entry) =>
          setPrintingEntries((prev) =>
            prev.map((existing) => (existing.id === entry.id ? entry : existing)),
          )
        }
        holographicPaperEntries={holographicPaperEntries}
        selectedHolographicPaperEntryId={selectedHolographicPaperEntryId}
        onSelectHolographicPaperEntry={setSelectedHolographicPaperEntryId}
        onHolographicPaperEntryCreated={(entry) => {
          setHolographicPaperEntries((prev) => [...prev, entry]);
          setSelectedHolographicPaperEntryId(entry.id);
        }}
        onHolographicPaperEntryUpdated={(entry) =>
          setHolographicPaperEntries((prev) =>
            prev.map((existing) => (existing.id === entry.id ? entry : existing)),
          )
        }
        pageCount={pageCount}
        errorMarginPercent={errorMarginPercent}
        onErrorMarginPercentChange={setErrorMarginPercent}
      />
      <div className="flex gap-6">
        <div className="flex-1">
          <PreviewTimeCostsSection
            wagePerHour={wagePerHour}
            onWagePerHourChange={setWagePerHour}
            timeCosts={timeCosts}
            onTimeCostsChange={setTimeCosts}
            pageCount={pageCount}
          />
        </div>
        <div className="flex-1">
          <PreviewCardsArtSection
            rows={cardRows}
            onRowsChange={setCardRows}
            totalSlots={totalSlots}
          />
        </div>
      </div>
    </div>
  );
}
