'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  getArtPrintPageCount,
  getFinanceSettings,
  listBinderCostEntries,
  listHolographicPaperCostEntries,
  listPrintingCostEntries,
  type BinderCostEntry,
  type FinanceSettings,
  type HolographicPaperCostEntry,
  type PrintingCostEntry,
} from '@/lib/api';
import {
  LoadingIndicator,
  toProblemDetailsInfo,
  useDelayedLoading,
  useToastContext,
} from '@/shared/feedback';

import { useBinderRouteContext } from '../BinderRouteContext';
import { CardsPlaceholderSection } from './_components/CardsPlaceholderSection';
import {
  computeHolographicPaperCost,
  computePrintingCost,
  computeTimeCost,
  TIME_COST_CATEGORIES,
} from './_lib/financeCalculations';
import { PhysicalCostsSection } from './_components/PhysicalCostsSection';
import { StickyTotals } from './_components/StickyTotals';
import { TimeCostsSection } from './_components/TimeCostsSection';

// Fixed toast id for the tab's own combined load, matching the pattern used
// by the binder route's own load (`OPEN_BINDER_TOAST_ID`).
const LOAD_FINANCIALS_TOAST_ID = 'load-financials';

type LoadStatus = 'loading' | 'success' | 'error';

// All the data this tab loads on its own (story 34's technical
// requirements: fetched locally within this page component rather than
// added to the shared `BinderRouteContext`, since it's only needed here).
interface FinancialsData {
  financeSettings: FinanceSettings;
  binderCostEntries: BinderCostEntry[];
  printingCostEntries: PrintingCostEntry[];
  holographicPaperCostEntries: HolographicPaperCostEntry[];
  pageCount: number;
}

// The "View Financials" tab (story 34): shows the estimated cost to produce
// the binder, replacing the previous "Financials are coming soon"
// placeholder. Reads the current binder's width/height/pages from the
// already-loaded `BinderRouteContext`, but fetches finance settings, the 3
// physical cost-entry catalogs, and the art-print page count itself.
export default function BinderFinancialsPage() {
  const { binder, updateBinder } = useBinderRouteContext();
  const { markFailed, dismiss } = useToastContext();

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [data, setData] = useState<FinancialsData | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const showLoading = useDelayedLoading(status === 'loading');

  const retry = useCallback(() => {
    setRetryToken((token) => token + 1);
  }, []);

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
          pageCountResult,
        ] = await Promise.all([
          getFinanceSettings(controller.signal),
          listBinderCostEntries(controller.signal),
          listPrintingCostEntries(controller.signal),
          listHolographicPaperCostEntries(controller.signal),
          getArtPrintPageCount(binder.id, controller.signal),
        ]);
        setData({
          financeSettings,
          binderCostEntries,
          printingCostEntries,
          holographicPaperCostEntries,
          pageCount: pageCountResult.pageCount,
        });
        setStatus('success');
        dismiss(LOAD_FINANCIALS_TOAST_ID);
      } catch (error) {
        if (controller.signal.aborted) return;
        setStatus('error');
        markFailed(LOAD_FINANCIALS_TOAST_ID, toProblemDetailsInfo(error));
      }
    }

    load();

    return () => {
      controller.abort();
    };
  }, [binder.id, retryToken, markFailed, dismiss]);

  if (status === 'loading') {
    return showLoading ? <LoadingIndicator label="Loading financials…" size="10" /> : null;
  }

  if (status === 'error' || !data) {
    return (
      <div className="flex flex-col items-center gap-4 p-8">
        <p className="text-body text-neutral-500">Financials could not be loaded.</p>
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

  const {
    financeSettings,
    binderCostEntries,
    printingCostEntries,
    holographicPaperCostEntries,
    pageCount,
  } = data;

  const selectedBinderEntry =
    binderCostEntries.find((entry) => entry.id === binder.selectedBinderCostEntryId) ?? null;
  const selectedPrintingEntry =
    printingCostEntries.find((entry) => entry.id === binder.selectedPrintingCostEntryId) ?? null;
  const selectedHolographicPaperEntry =
    holographicPaperCostEntries.find(
      (entry) => entry.id === binder.selectedHolographicPaperCostEntryId,
    ) ?? null;

  const printingCost = selectedPrintingEntry
    ? computePrintingCost(
        selectedPrintingEntry.pricePerPage,
        pageCount,
        financeSettings.errorMarginPercent,
      )
    : null;
  const holographicPaperCost = selectedHolographicPaperEntry
    ? computeHolographicPaperCost(
        selectedHolographicPaperEntry.price,
        selectedHolographicPaperEntry.pagesIncluded,
        pageCount,
        financeSettings.errorMarginPercent,
      )
    : null;

  // The sticky/section-level physical-costs total uses the error-margin-
  // applied Printing/Holographic Paper figures; the Binder cost has no
  // margin concept (it's a one-time acquisition price, not page-count
  // dependent).
  const physicalCostsTotal =
    (selectedBinderEntry?.price ?? 0) +
    (printingCost?.withMargin ?? 0) +
    (holographicPaperCost?.withMargin ?? 0);

  const timeCostResults = TIME_COST_CATEGORIES.map(({ key }) =>
    computeTimeCost(financeSettings.timeCosts[key], pageCount, financeSettings.wagePerHour),
  );
  const timeCostsTotal = timeCostResults.reduce((sum, result) => sum + result.price, 0);
  const totalHours = timeCostResults.reduce((sum, result) => sum + result.hours, 0);

  // The Cards section is a static placeholder ($0.00) until story 38.
  const cardsTotal = 0;

  return (
    <div className="flex flex-col gap-6 px-8 pb-8">
      <StickyTotals
        physicalCostsTotal={physicalCostsTotal}
        timeCostsTotal={timeCostsTotal}
        cardsTotal={cardsTotal}
        totalHours={totalHours}
        financeSettings={financeSettings}
      />
      <PhysicalCostsSection
        binder={binder}
        binderCostEntries={binderCostEntries}
        printingCostEntries={printingCostEntries}
        holographicPaperCostEntries={holographicPaperCostEntries}
        financeSettings={financeSettings}
        pageCount={pageCount}
        onBinderCostEntryCreated={(entry) =>
          setData((prev) =>
            prev ? { ...prev, binderCostEntries: [...prev.binderCostEntries, entry] } : prev,
          )
        }
        onBinderCostEntryUpdated={(entry) =>
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  binderCostEntries: prev.binderCostEntries.map((existing) =>
                    existing.id === entry.id ? entry : existing,
                  ),
                }
              : prev,
          )
        }
        onPrintingCostEntryCreated={(entry) =>
          setData((prev) =>
            prev ? { ...prev, printingCostEntries: [...prev.printingCostEntries, entry] } : prev,
          )
        }
        onPrintingCostEntryUpdated={(entry) =>
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  printingCostEntries: prev.printingCostEntries.map((existing) =>
                    existing.id === entry.id ? entry : existing,
                  ),
                }
              : prev,
          )
        }
        onHolographicPaperCostEntryCreated={(entry) =>
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  holographicPaperCostEntries: [...prev.holographicPaperCostEntries, entry],
                }
              : prev,
          )
        }
        onHolographicPaperCostEntryUpdated={(entry) =>
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  holographicPaperCostEntries: prev.holographicPaperCostEntries.map((existing) =>
                    existing.id === entry.id ? entry : existing,
                  ),
                }
              : prev,
          )
        }
        onBinderUpdated={updateBinder}
        onFinanceSettingsUpdated={(settings) =>
          setData((prev) => (prev ? { ...prev, financeSettings: settings } : prev))
        }
      />
      <div className="flex gap-6">
        <div className="flex-1">
          <TimeCostsSection
            financeSettings={financeSettings}
            pageCount={pageCount}
            onFinanceSettingsUpdated={(settings) =>
              setData((prev) => (prev ? { ...prev, financeSettings: settings } : prev))
            }
          />
        </div>
        <div className="flex-1">
          <CardsPlaceholderSection />
        </div>
      </div>
    </div>
  );
}
