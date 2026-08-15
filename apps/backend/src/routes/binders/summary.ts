import { getMaxPhysicalPage, getTotalSlots, resolveSpread } from '@binder-project-planner/shared';

import type { DatabaseConnection } from '../../database/client.js';
import { countOccupiedSlots } from '../../placement/occupancy.js';
import { listPlacedArtForPreview } from '../art/index.js';
import { countCardAcquisition, listPlacedCardsForPreview } from '../cards/index.js';

import { serializeBinder } from './serialization.js';
import { listTagsForBinder } from './tagsHelpers.js';
import type { BinderRow } from './types.js';

// Builds one binder's home-page summary (story 5's list shape plus story
// 20's embedded preview spread), shared by `GET /binders` and story 21's
// `POST /binders/{binderId}/duplicate` response - both need the identical
// shape for a binder row they already have in hand.
export function buildBinderSummary(database: DatabaseConnection['database'], row: BinderRow) {
  const maxPhysicalPage = getMaxPhysicalPage(row.pages);
  const spread = resolveSpread(row.previewPhysicalPage, maxPhysicalPage);
  // Only the spread's actual page(s) - the first/last spread has only one
  // side - are queried, matching the OpenAPI `BinderPreviewSpread` schema's
  // `left`/`right` nullability.
  const physicalPages = [spread.left, spread.right].filter((page): page is number => page !== null);

  // Story 22: whole-binder slot-completion counts. `totalSlots` is derived
  // purely from the binder's dimensions/page count; `occupiedSlots` counts
  // every slot holding a card or covered by placed art (unplaced items
  // excluded), and the client derives the slot-completion percentage from
  // the two.
  const totalSlots = getTotalSlots(row.width, row.height, row.pages);
  const occupiedSlots = countOccupiedSlots(database, row.id);

  // Story 36: whole-binder card-acquisition counts, covering both placed
  // and unplaced cards (multi-slot art excluded, since it isn't a `Card`
  // record at all). The client derives the rounded acquisition percentage
  // from the two, and displays `N/A` when `totalCards` is zero.
  const { acquiredCards, totalCards } = countCardAcquisition(database, row.id);

  return {
    ...serializeBinder(row, listTagsForBinder(database, row.id)),
    totalSlots,
    occupiedSlots,
    emptySlots: totalSlots - occupiedSlots,
    acquiredCards,
    totalCards,
    preview: {
      spread,
      cards: listPlacedCardsForPreview(database, row.id, physicalPages),
      art: listPlacedArtForPreview(database, row.id, physicalPages),
    },
  };
}
