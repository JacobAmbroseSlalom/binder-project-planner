import { CUSTOM_CARD_NAME_MAX_LENGTH } from '@binder-project-planner/shared';
import { useEffect, useState } from 'react';

import type { Card, UpdateCardDetailsRequest } from '@/lib/api';

// Story 49's Card List row edit action's in-progress local field values -
// never persisted until "Save" is selected, mirroring `PriceReviewRow`'s
// own "client-side until committed" convention. `price` stays a raw
// string (rather than `number | null`) so the input can hold an
// in-progress/invalid value while typing, matching the price-review
// row's own `MoneyInput` usage.
export interface CardDetailsEditValues {
  name: string;
  setName: string;
  localNumber: string;
  variation: string;
  price: string;
  // `null` until a replacement file is chosen; the object URL is revoked
  // whenever it's replaced or the edit ends (cancelled or saved).
  imageFile: File | null;
  imagePreviewUrl: string | null;
}

// The edit row's starting values, pre-filled from the card's currently
// saved fields (blank rather than the placeholder dash used elsewhere,
// since these are real editable inputs).
function createCardDetailsEditValues(card: Card): CardDetailsEditValues {
  return {
    name: card.name,
    setName: card.setName ?? '',
    localNumber: card.localNumber ?? '',
    variation: card.variation ?? '',
    price: card.price !== null ? card.price.toString() : '',
    imageFile: null,
    imagePreviewUrl: null,
  };
}

// Encapsulates the Card List table's row-edit state (story 49): at most
// one row editable at a time, its in-progress field values kept
// separately from the card list's own data until "Save" actually
// succeeds. Extracted out of `CardListTable` (which was growing past this
// house-cleaning pass's line-count threshold) so that component only
// needs to wire up the returned state/handlers rather than own them
// directly.
export function useCardDetailsRowEditing(
  onEditCardDetails: (cardId: string, values: UpdateCardDetailsRequest) => Promise<Card>,
  onEditingRowChange?: (isEditingRow: boolean) => void,
) {
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<CardDetailsEditValues | null>(null);
  const [editNameError, setEditNameError] = useState<string | null>(null);

  // Reports the row-editing state to the parent every time it changes
  // (including on mount), rather than only from the handlers below, so
  // the parent's own state always matches this table's regardless of
  // which handler last changed it.
  useEffect(() => {
    onEditingRowChange?.(editingCardId !== null);
  }, [editingCardId, onEditingRowChange]);

  function startEditingCard(card: Card) {
    setEditingCardId(card.id);
    setEditValues(createCardDetailsEditValues(card));
    setEditNameError(null);
  }

  // "Cancel": discards every edited value in the row without a backend
  // request, per the story's acceptance criteria.
  function cancelEditingCard() {
    if (editValues?.imagePreviewUrl) URL.revokeObjectURL(editValues.imagePreviewUrl);
    setEditingCardId(null);
    setEditValues(null);
    setEditNameError(null);
  }

  // Replaces the row's selected image file, revoking the previous preview
  // object URL (if any) so choosing a different file, or clearing the
  // selection, never leaks the prior one.
  function changeEditingCardImage(file: File | null) {
    setEditValues((previous) => {
      if (!previous) return previous;
      if (previous.imagePreviewUrl) URL.revokeObjectURL(previous.imagePreviewUrl);
      return {
        ...previous,
        imageFile: file,
        imagePreviewUrl: file ? URL.createObjectURL(file) : null,
      };
    });
  }

  // Updates a single field of the currently-editing row's in-progress
  // values - used by each row input's `onChange` instead of each call
  // site repeating its own `setEditValues` updater.
  function updateEditField<K extends keyof CardDetailsEditValues>(
    field: K,
    value: CardDetailsEditValues[K],
  ) {
    setEditValues((previous) => (previous ? { ...previous, [field]: value } : previous));
  }

  // "Save": validates the row's required `name` field (the OpenAPI
  // schema's own `minLength: 1` only guards the raw untrimmed value, so a
  // whitespace-only name still needs this check, matching every other
  // custom-card-field validation in this codebase), then commits every
  // edited field in one request. A blank price clears the card's saved
  // price entirely (see `updateCardDetails`'s own contract). On success,
  // the row returns to its normal display state; on failure, it stays in
  // its editing state (with the entered values preserved) so the user can
  // retry or adjust them - the error itself surfaces via the shared
  // save-status toast `onEditCardDetails` already starts.
  function saveEditingCard(card: Card) {
    if (!editValues) return;

    const trimmedName = editValues.name.trim();
    if (!trimmedName) {
      setEditNameError('Name is required.');
      return;
    }
    if (trimmedName.length > CUSTOM_CARD_NAME_MAX_LENGTH) {
      setEditNameError(`Name must be ${CUSTOM_CARD_NAME_MAX_LENGTH} characters or fewer.`);
      return;
    }
    setEditNameError(null);

    const parsedPrice = editValues.price.trim() === '' ? null : Number.parseFloat(editValues.price);

    onEditCardDetails(card.id, {
      name: trimmedName,
      setName: editValues.setName.trim() || null,
      localNumber: editValues.localNumber.trim() || null,
      variation: editValues.variation.trim() || null,
      price: parsedPrice === null || Number.isNaN(parsedPrice) ? null : parsedPrice,
      image: editValues.imageFile,
    })
      .then(() => {
        if (editValues.imagePreviewUrl) URL.revokeObjectURL(editValues.imagePreviewUrl);
        setEditingCardId(null);
        setEditValues(null);
      })
      .catch(() => {
        // Already surfaced via the save-status toast; nothing further to do
        // here besides leaving the row open for another attempt.
      });
  }

  return {
    editingCardId,
    editValues,
    editNameError,
    startEditingCard,
    cancelEditingCard,
    changeEditingCardImage,
    updateEditField,
    saveEditingCard,
  };
}
