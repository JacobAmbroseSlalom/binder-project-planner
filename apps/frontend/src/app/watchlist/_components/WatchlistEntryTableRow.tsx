'use client';

import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CircleCheck, GripVertical, Trash2 } from 'lucide-react';

import { resolveCardImageUrl, type WatchlistEntry } from '@/lib/api';
import { ImagePreview, Tooltip } from '@/shared/feedback';
import { computeCardPriceChange } from '@/shared/finance/computeCardPriceChange';
import { formatCurrency } from '@/shared/finance/formatCurrency';
import { MoneyInput } from '@/shared/finance/MoneyInput';

import type { PriceReviewRow, PriceReviewSource } from '../useWatchlistPriceReview';
import { VariantSelect } from './VariantSelect';

// Story 45's price-review row data a table cell needs, mirroring
// `PriceReviewTableProps` but keyed by `watchlistEntryId`.
export interface WatchlistPriceReviewTableProps {
  isFetching: boolean;
  rows: Map<string, PriceReviewRow>;
  onVariantChange: (watchlistEntryId: string, variantKey: string) => void;
  onPriceInputChange: (watchlistEntryId: string, rawValue: string) => void;
  onFillPrice: (watchlistEntryId: string, value: number | null, source: PriceReviewSource) => void;
}

// One row's drag handle (story 45's manual reordering, now animated via
// `@dnd-kit/sortable`): a small grip icon. Purely presentational - the
// enclosing row (`WatchlistEntryRow`/`DividerRow`) owns the single
// `useSortable` call for the whole row (row = drag source + drop target +
// sortable list item), and passes its `attributes`/`listeners` down here
// so only this handle (not the whole row) starts a drag, while
// `setActivatorNodeRef` tells dnd-kit which element to focus for keyboard
// dragging.
function DragHandle({
  disabled,
  isDragging,
  attributes,
  listeners,
  setActivatorNodeRef,
}: {
  disabled?: boolean;
  isDragging: boolean;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
}) {
  return (
    <Tooltip label="Drag to reorder">
      <button
        ref={setActivatorNodeRef}
        type="button"
        disabled={disabled}
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
        className={`flex size-7 cursor-grab items-center justify-center rounded-standard text-neutral-500 hover:bg-neutral-700 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 ${
          isDragging ? 'opacity-50' : ''
        }`}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

// One entry's row, split out from the table so its own `useSortable` hook
// (the row is the drag source, drop target, and sortable list item all at
// once, animated via `@dnd-kit/sortable`) can be called once per row
// rather than inside a `.map()` callback, mirroring this codebase's
// existing precedent (e.g. `UnplacedCard`/`BinderSlot`). Extracted out of
// `WatchlistEntryTable` (which was growing past this house-cleaning
// pass's line-count threshold), mirroring `CardListTableRow`'s own
// extraction.
export function WatchlistEntryRow({
  entry,
  controlsDisabled,
  dragDisabled,
  priceReview,
  onRemove,
  isRemovePending,
  onMarkAcquiredAndRemove,
  isMarkAcquiredPending,
}: {
  entry: WatchlistEntry;
  controlsDisabled: boolean;
  // Story 52: separate from `controlsDisabled` - dragging is also
  // disabled whenever `canReorder` is false (a column sort or active
  // search/filter is applied), independent of the price-review state that
  // `controlsDisabled` alone covers, while Remove/Mark-as-acquired-and-
  // remove stay available either way.
  dragDisabled: boolean;
  priceReview: WatchlistPriceReviewTableProps | null;
  onRemove: (entryId: string) => void;
  isRemovePending: boolean;
  onMarkAcquiredAndRemove: (entryId: string) => void;
  isMarkAcquiredPending: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id, disabled: dragDisabled });
  const reviewRow = priceReview?.rows.get(entry.id) ?? null;
  const isReferenced = entry.cardId !== null;
  const isRowPending = isRemovePending || isMarkAcquiredPending;

  return (
    <tr
      ref={setNodeRef}
      // `CSS.Translate` (not `CSS.Transform`) deliberately drops the scale
      // component dnd-kit would otherwise compute from this row's rect vs.
      // the dragged row's rect - rows here can have very differently
      // shaped rects (e.g. against the full-width divider row above), so a
      // scale transform visibly stretched/skewed whichever row it applied
      // to.
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // The dragged row itself lifts above its siblings (`relative z-10`)
      // and dims slightly while every other row animates into its new
      // slot beneath it - the sliding animation itself comes from the
      // `transform`/`transition` style above, driven by `useSortable`.
      className={`border-b border-neutral-800 ${
        isDragging ? 'relative z-10 bg-neutral-800 opacity-90' : ''
      }`}
    >
      <td className="py-2 pr-2 text-center">
        <DragHandle
          disabled={dragDisabled}
          isDragging={isDragging}
          attributes={attributes}
          listeners={listeners}
          setActivatorNodeRef={setActivatorNodeRef}
        />
      </td>
      <td className="py-2 pr-2">
        <ImagePreview src={resolveCardImageUrl(entry.imageUrl)} alt={entry.name}>
          <div className="flex h-12 w-9 items-center justify-center overflow-hidden rounded-standard border border-neutral-700 bg-neutral-800">
            {/* eslint-disable-next-line @next/next/no-img-element -- the
                entry's image comes from an arbitrary backend/provider
                origin, so next/image's fixed-domain optimization doesn't
                apply here. */}
            <img
              src={resolveCardImageUrl(entry.imageUrl)}
              alt={entry.name}
              className="h-full w-full object-contain"
            />
          </div>
        </ImagePreview>
      </td>
      <td className="py-2 pr-4">{entry.name}</td>
      <td className="py-2 pr-4 text-neutral-500">{entry.variation ?? '—'}</td>
      <td className="py-2 pr-4 text-neutral-500">{entry.setName ?? '—'}</td>
      <td className="py-2 pr-4 text-neutral-500">{entry.localNumber ?? '—'}</td>
      <td className="py-2 pr-4">
        {entry.price === null ? (
          <span className="text-neutral-500">--</span>
        ) : priceReview ? (
          <button
            type="button"
            onClick={() => priceReview.onFillPrice(entry.id, entry.price, 'savedPrice')}
            className={`cursor-pointer hover:underline ${
              entry.isManualPrice ? 'text-secondary' : ''
            }`}
          >
            {formatCurrency(entry.price)}
          </button>
        ) : (
          <span className={entry.isManualPrice ? 'text-secondary' : ''}>
            {formatCurrency(entry.price)}
          </span>
        )}
      </td>
      <td className="py-2 pr-4 text-neutral-500">
        {entry.priceUpdatedAt ? new Date(entry.priceUpdatedAt).toLocaleDateString() : '--'}
      </td>
      {priceReview && (
        <WatchlistPriceReviewCells entry={entry} row={reviewRow} priceReview={priceReview} />
      )}
      <td className="py-2 pl-4">
        <div className="flex justify-end gap-2">
          {isReferenced && (
            <Tooltip label="Mark as acquired & remove">
              <button
                type="button"
                disabled={controlsDisabled || isRowPending}
                onClick={() => onMarkAcquiredAndRemove(entry.id)}
                aria-label={`Mark ${entry.name} as acquired and remove from What I'm Looking For`}
                className="flex size-9 cursor-pointer items-center justify-center rounded-standard text-neutral-100 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CircleCheck className="size-4" aria-hidden="true" />
              </button>
            </Tooltip>
          )}
          <Tooltip label="Remove from What I'm Looking For">
            <button
              type="button"
              disabled={controlsDisabled || isRowPending}
              onClick={() => onRemove(entry.id)}
              aria-label={`Remove ${entry.name} from What I'm Looking For`}
              className="flex size-9 cursor-pointer items-center justify-center rounded-standard text-neutral-100 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      </td>
    </tr>
  );
}

// This page's 6 expanded review-mode cells for one entry's row, mirroring
// `PriceReviewCells` exactly but keyed by `watchlistEntryId`.
function WatchlistPriceReviewCells({
  entry,
  row,
  priceReview,
}: {
  entry: WatchlistEntry;
  row: PriceReviewRow | null;
  priceReview: WatchlistPriceReviewTableProps;
}) {
  const selectedVariant =
    row?.variants.find((variant) => variant.variantKey === row.selectedVariantKey) ?? null;
  const change = computeCardPriceChange(entry.price, row?.newPrice ?? null);
  const isRowLoading = priceReview.isFetching || row === null;
  const hasPriceAnomaly =
    !!selectedVariant &&
    selectedVariant.marketPrice !== null &&
    selectedVariant.lowPrice !== null &&
    selectedVariant.lowPrice > selectedVariant.marketPrice;

  return (
    <>
      <td className="py-2 pr-4">
        {isRowLoading ? (
          <span className="text-neutral-500">--</span>
        ) : (
          <VariantSelect
            variants={row.variants}
            selectedVariantKey={row.selectedVariantKey}
            onChange={(variantKey) => priceReview.onVariantChange(entry.id, variantKey)}
          />
        )}
      </td>
      <td className="py-2 pr-4">
        {isRowLoading || !selectedVariant || selectedVariant.marketPrice === null ? (
          <span className="text-neutral-500">--</span>
        ) : (
          <button
            type="button"
            onClick={() =>
              priceReview.onFillPrice(entry.id, selectedVariant.marketPrice, 'variant')
            }
            className="cursor-pointer hover:underline"
          >
            {formatCurrency(selectedVariant.marketPrice)}
          </button>
        )}
      </td>
      <td className="py-2 pr-4">
        {isRowLoading || !selectedVariant || selectedVariant.lowPrice === null ? (
          <span className="text-neutral-500">--</span>
        ) : (
          <button
            type="button"
            onClick={() => priceReview.onFillPrice(entry.id, selectedVariant.lowPrice, 'variant')}
            className={`cursor-pointer hover:underline ${hasPriceAnomaly ? 'text-secondary' : ''}`}
          >
            {formatCurrency(selectedVariant.lowPrice)}
          </button>
        )}
      </td>
      <td className="py-2 pr-4">
        {isRowLoading || !row?.tcgplayerUrl ? (
          <span className="text-neutral-500">--</span>
        ) : (
          <a
            href={row.tcgplayerUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary hover:underline"
          >
            View
          </a>
        )}
      </td>
      <td className="py-2 pr-4">
        <MoneyInput
          min={0}
          disabled={isRowLoading}
          value={row?.newPrice?.toString() ?? ''}
          onChange={(event) => priceReview.onPriceInputChange(entry.id, event.target.value)}
          ariaLabel={`${entry.name} new price`}
          className="w-28"
        />
      </td>
      <td className="py-2 pr-4 whitespace-nowrap">
        {change.direction === null || change.direction === 'unchanged' ? (
          <span className="text-neutral-500">--</span>
        ) : change.direction === 'increase' ? (
          <span className="text-success">▲ +{formatCurrency(change.amount)}</span>
        ) : (
          <span className="text-error">▼ -{formatCurrency(change.amount)}</span>
        )}
      </td>
    </>
  );
}
