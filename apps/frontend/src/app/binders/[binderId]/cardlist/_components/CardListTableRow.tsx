import {
  CUSTOM_CARD_IMAGE_ACCEPT,
  CUSTOM_CARD_NAME_MAX_LENGTH,
  CUSTOM_CARD_NUMBER_MAX_LENGTH,
  CUSTOM_CARD_SET_MAX_LENGTH,
} from '@binder-project-planner/shared';
import { Bookmark, Circle, CircleCheck, Pencil } from 'lucide-react';

import { resolveCardImageUrl, type Card } from '@/lib/api';
import { ImagePreview, Tooltip } from '@/shared/feedback';
import { computeCardPriceChange } from '@/shared/finance/computeCardPriceChange';
import { formatCurrency } from '@/shared/finance/formatCurrency';
import { MoneyInput } from '@/shared/finance/MoneyInput';
import { VariationCombobox } from '@/shared/forms';

import { VariantSelect } from './VariantSelect';
import type { CardDetailsEditValues } from '../useCardDetailsRowEditing';
import type { PriceReviewRow, PriceReviewSource } from '../useCardPriceReview';

// The shared filled-input treatment (styling.instructions.md's "Forms &
// inputs" section) sized for this table's compact row height, used by
// story 49's row-edit text fields (name/variation/set/number) - the price
// field instead reuses the shared `MoneyInput` for its "$" prefix.
const rowEditInputClassName =
  'w-full rounded-standard border border-transparent bg-neutral-800 px-2 py-1 placeholder:text-neutral-500 focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';

// Story 38's price-review row data a table cell needs, plus the handlers
// it calls back into `useCardPriceReview` through. `null` while the
// price-review state isn't active at all.
export interface PriceReviewTableProps {
  isFetching: boolean;
  rows: Map<string, PriceReviewRow>;
  onVariantChange: (cardId: string, variantKey: string) => void;
  onPriceInputChange: (cardId: string, rawValue: string) => void;
  onFillPrice: (cardId: string, value: number | null, source: PriceReviewSource) => void;
}

// Story 37's Card List table's one card row: its acquisition toggle,
// thumbnail, editable fields (story 49), story 38's expanded price-review
// cells (only while active), and its trailing watchlist/edit actions.
// Extracted out of `CardListTable`, which was rendering every row inline
// via `.map`, so that component only needs to pass each row its data plus
// the shared edit-state handlers.
export function CardListTableRow({
  card,
  isTogglePending,
  onToggleAcquired,
  priceReview,
  isBinderLocked,
  editingCardId,
  isEditingThisRow,
  isSavingThisRow,
  editValues,
  editNameError,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onChangeImage,
  onUpdateField,
  onAddToWatchlist,
}: {
  card: Card;
  isTogglePending: boolean;
  onToggleAcquired: (cardId: string) => void;
  priceReview: PriceReviewTableProps | null;
  isBinderLocked: boolean;
  // The table's currently-editing row id (if any), used only to disable
  // this row's own Edit button while a *different* row is being edited.
  editingCardId: string | null;
  isEditingThisRow: boolean;
  isSavingThisRow: boolean;
  // Only meaningful (and only read) while `isEditingThisRow` is true.
  editValues: CardDetailsEditValues | null;
  editNameError: string | null;
  onStartEdit: (card: Card) => void;
  onCancelEdit: () => void;
  onSaveEdit: (card: Card) => void;
  onChangeImage: (file: File | null) => void;
  onUpdateField: <K extends keyof CardDetailsEditValues>(
    field: K,
    value: CardDetailsEditValues[K],
  ) => void;
  onAddToWatchlist: (cardId: string) => void;
}) {
  const reviewRow = priceReview?.rows.get(card.id) ?? null;

  return (
    <tr className="border-b border-neutral-800">
      <td className="py-2 pr-4 text-center">
        {/* Story 37: reuses the same acquisition mutation and
            optimistic-update/rollback behavior introduced by story
            36 (`toggleCardAcquired`/`pendingCardAcquiredToggleIds`,
            threaded down from `page.tsx`), and the same icon-swap
            button styling used on the layout tab's `CardTile`
            (sized up here since this is this column's sole
            content, rather than one of several hover actions),
            rather than a second card-list-specific control. */}
        <Tooltip label={card.acquired ? 'Mark as unacquired' : 'Mark as acquired'}>
          <button
            type="button"
            disabled={isTogglePending}
            onClick={() => onToggleAcquired(card.id)}
            aria-label={
              card.acquired ? `Mark ${card.name} as unacquired` : `Mark ${card.name} as acquired`
            }
            className="flex size-9 cursor-pointer items-center justify-center rounded-standard text-neutral-100 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {card.acquired ? (
              <CircleCheck className="size-7 fill-secondary text-background" aria-hidden="true" />
            ) : (
              <Circle className="size-7" aria-hidden="true" />
            )}
          </button>
        </Tooltip>
      </td>
      <td className="py-2 pr-2">
        {isEditingThisRow ? (
          // Story 49: a compact file-picker replacing the thumbnail
          // while editing - clicking anywhere in it opens the native
          // file picker (the `<input>` is visually hidden rather than
          // removed, keeping this keyboard/screen-reader accessible),
          // previewing the newly chosen file via its own object URL
          // or falling back to the card's existing image otherwise.
          <label className="flex h-12 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-standard border border-dashed border-neutral-600 bg-neutral-800 hover:border-primary">
            <input
              type="file"
              accept={CUSTOM_CARD_IMAGE_ACCEPT}
              disabled={isSavingThisRow}
              onChange={(event) => onChangeImage(event.target.files?.[0] ?? null)}
              className="sr-only"
            />
            {/* eslint-disable-next-line @next/next/no-img-element -- the
                card image comes from an arbitrary backend/provider
                origin, so next/image's fixed-domain optimization
                doesn't apply here. */}
            <img
              src={editValues?.imagePreviewUrl ?? resolveCardImageUrl(card.imageUrl)}
              alt={card.name}
              className="h-full w-full object-contain"
            />
          </label>
        ) : (
          /* Story 37 (this file) + on-hover enlarge: wraps the
             small thumbnail in the shared `ImagePreview` so hovering
             a row shows a much larger version of the same image,
             without needing a second, higher-resolution image URL -
             the browser already has the thumbnail's URL cached from
             the `img` below, so the enlarged copy loads instantly. */
          <ImagePreview src={resolveCardImageUrl(card.imageUrl)} alt={card.name}>
            <div className="flex h-12 w-9 items-center justify-center overflow-hidden rounded-standard border border-neutral-700 bg-neutral-800">
              {/* eslint-disable-next-line @next/next/no-img-element -- the
                  card image comes from an arbitrary backend/provider
                  origin, so next/image's fixed-domain optimization
                  doesn't apply here. */}
              <img
                src={resolveCardImageUrl(card.imageUrl)}
                alt={card.name}
                className="h-full w-full object-contain"
              />
            </div>
          </ImagePreview>
        )}
      </td>
      <td className="py-2 pr-4">
        {isEditingThisRow ? (
          <div className="flex flex-col gap-1">
            <input
              type="text"
              value={editValues?.name ?? ''}
              disabled={isSavingThisRow}
              maxLength={CUSTOM_CARD_NAME_MAX_LENGTH}
              aria-label={`${card.name}'s name`}
              onChange={(event) => onUpdateField('name', event.target.value)}
              className={rowEditInputClassName}
            />
            {editNameError && (
              <span role="alert" className="text-caption text-error">
                {editNameError}
              </span>
            )}
          </div>
        ) : (
          card.name
        )}
      </td>
      <td className="py-2 pr-4 text-neutral-500">
        {isEditingThisRow ? (
          <VariationCombobox
            id={`card-${card.id}-variation`}
            value={editValues?.variation ?? ''}
            disabled={isSavingThisRow}
            placeholder=""
            onChange={(value) => onUpdateField('variation', value)}
          />
        ) : (
          (card.variation ?? '—')
        )}
      </td>
      <td className="py-2 pr-4 text-neutral-500">
        {isEditingThisRow ? (
          <input
            type="text"
            value={editValues?.setName ?? ''}
            disabled={isSavingThisRow}
            maxLength={CUSTOM_CARD_SET_MAX_LENGTH}
            aria-label={`${card.name}'s set`}
            onChange={(event) => onUpdateField('setName', event.target.value)}
            className={rowEditInputClassName}
          />
        ) : (
          (card.setName ?? '—')
        )}
      </td>
      <td className="py-2 pr-4 text-neutral-500">
        {isEditingThisRow ? (
          <input
            type="text"
            value={editValues?.localNumber ?? ''}
            disabled={isSavingThisRow}
            maxLength={CUSTOM_CARD_NUMBER_MAX_LENGTH}
            aria-label={`${card.name}'s number`}
            onChange={(event) => onUpdateField('localNumber', event.target.value)}
            className={rowEditInputClassName}
          />
        ) : (
          (card.localNumber ?? '—')
        )}
      </td>
      <td className="py-2 pr-4">
        {isEditingThisRow ? (
          <MoneyInput
            min={0}
            disabled={isSavingThisRow}
            value={editValues?.price ?? ''}
            onChange={(event) => onUpdateField('price', event.target.value)}
            ariaLabel={`${card.name}'s price`}
            className="w-28"
          />
        ) : card.price === null ? (
          <span className="text-neutral-500">--</span>
        ) : priceReview ? (
          // Story 38: clicking the saved price fills the review
          // row's new-price input with it (only meaningful, and
          // only clickable, while review is active) - a manually
          // entered price renders in the secondary color to stay
          // visually distinct from an API-derived one.
          <button
            type="button"
            onClick={() => priceReview.onFillPrice(card.id, card.price, 'savedPrice')}
            className={`cursor-pointer hover:underline ${
              card.isManualPrice ? 'text-secondary' : ''
            }`}
          >
            {formatCurrency(card.price)}
          </button>
        ) : (
          <span className={card.isManualPrice ? 'text-secondary' : ''}>
            {formatCurrency(card.price)}
          </span>
        )}
      </td>
      <td className="py-2 pr-4 text-neutral-500">
        {card.priceUpdatedAt ? new Date(card.priceUpdatedAt).toLocaleDateString() : '--'}
      </td>
      {priceReview && <PriceReviewCells card={card} row={reviewRow} priceReview={priceReview} />}
      <td className="py-2 pl-4 text-right">
        {isEditingThisRow ? (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={isSavingThisRow}
              onClick={onCancelEdit}
              className="cursor-pointer rounded-standard px-2 py-1 text-caption font-bold text-neutral-100 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSavingThisRow}
              onClick={() => onSaveEdit(card)}
              className="cursor-pointer rounded-standard bg-primary px-2 py-1 text-caption font-bold hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            {/* Story 45: available regardless of the binder's lock
                state, since adding to the watchlist doesn't mutate
                this binder at all - unlike Edit below, which is
                hidden while locked. */}
            <Tooltip label="Add to What I'm Looking For">
              <button
                type="button"
                disabled={priceReview !== null}
                onClick={() => onAddToWatchlist(card.id)}
                aria-label={`Add ${card.name} to What I'm Looking For`}
                className="flex size-9 cursor-pointer items-center justify-center rounded-standard text-neutral-100 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Bookmark className="size-4" aria-hidden="true" />
              </button>
            </Tooltip>
            {!isBinderLocked && (
              <Tooltip label="Edit card">
                <button
                  type="button"
                  disabled={
                    priceReview !== null || (editingCardId !== null && editingCardId !== card.id)
                  }
                  onClick={() => onStartEdit(card)}
                  aria-label={`Edit ${card.name}`}
                  className="flex size-9 cursor-pointer items-center justify-center rounded-standard text-neutral-100 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </button>
              </Tooltip>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// Story 38's 6 expanded review-mode cells for one card's row, split out
// from the main row markup above purely to keep that already-long row
// template readable.
function PriceReviewCells({
  card,
  row,
  priceReview,
}: {
  card: Card;
  row: PriceReviewRow | null;
  priceReview: PriceReviewTableProps;
}) {
  const selectedVariant =
    row?.variants.find((variant) => variant.variantKey === row.selectedVariantKey) ?? null;
  const change = computeCardPriceChange(card.price, row?.newPrice ?? null);
  const isRowLoading = priceReview.isFetching || row === null;
  // pokemontcg.io's "low" price is meant to sit at or below its "market"
  // price - when a listing anomaly flips that (low > market), flag the
  // low price in the secondary color so the reviewer notices before
  // filling it into the new-price input.
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
            onChange={(variantKey) => priceReview.onVariantChange(card.id, variantKey)}
          />
        )}
      </td>
      <td className="py-2 pr-4">
        {isRowLoading || !selectedVariant || selectedVariant.marketPrice === null ? (
          <span className="text-neutral-500">--</span>
        ) : (
          <button
            type="button"
            onClick={() => priceReview.onFillPrice(card.id, selectedVariant.marketPrice, 'variant')}
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
            onClick={() => priceReview.onFillPrice(card.id, selectedVariant.lowPrice, 'variant')}
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
          onChange={(event) => priceReview.onPriceInputChange(card.id, event.target.value)}
          ariaLabel={`${card.name} new price`}
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
