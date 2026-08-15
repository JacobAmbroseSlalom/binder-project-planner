import { getMaxPhysicalPage } from '@binder-project-planner/shared';
import { and, eq, isNotNull } from 'drizzle-orm';

import type { DatabaseConnection } from '../../database/client.js';
import { art, cards } from '../../database/schema.js';

// Story 27: identifies which currently placed cards and multi-slot art
// would no longer fit a proposed width/height/stored-page-count change.
export function findResizeAffectedPlacements(
  database: DatabaseConnection['database'],
  binderId: string,
  proposed: { width: number; height: number; pages: number },
) {
  const maxPhysicalPage = getMaxPhysicalPage(proposed.pages);

  const placedCards = database
    .select({
      id: cards.id,
      physicalPage: cards.physicalPage,
      row: cards.row,
      column: cards.column,
    })
    .from(cards)
    .where(and(eq(cards.binderId, binderId), isNotNull(cards.physicalPage)))
    .all();

  const affectedCardIds = placedCards
    .filter((cardRow) => {
      if (cardRow.physicalPage === null || cardRow.row === null || cardRow.column === null) {
        return false;
      }
      return (
        cardRow.physicalPage > maxPhysicalPage ||
        cardRow.row > proposed.height ||
        cardRow.column > proposed.width
      );
    })
    .map((cardRow) => cardRow.id);

  const placedArt = database
    .select({
      id: art.id,
      physicalPage: art.physicalPage,
      row: art.row,
      column: art.column,
      widthSlots: art.widthSlots,
      heightSlots: art.heightSlots,
    })
    .from(art)
    .where(and(eq(art.binderId, binderId), isNotNull(art.physicalPage)))
    .all();

  const affectedArtIds = placedArt
    .filter((artRow) => {
      if (artRow.physicalPage === null || artRow.row === null || artRow.column === null) {
        return false;
      }

      const bottomRow = artRow.row + artRow.heightSlots - 1;
      const rightColumn = artRow.column + artRow.widthSlots - 1;

      return (
        artRow.physicalPage > maxPhysicalPage ||
        bottomRow > proposed.height ||
        rightColumn > proposed.width
      );
    })
    .map((artRow) => artRow.id);

  return {
    affectedCardIds,
    affectedArtIds,
    affectedCardCount: affectedCardIds.length,
    affectedArtCount: affectedArtIds.length,
  };
}

// Thrown from inside `PATCH /binders/{binderId}`'s transaction (story 27)
// when a reducing resize would affect placed cards/art and the request
// didn't opt into relocating them; the route handler maps this to a
// `409 Conflict` Problem Details response and the transaction rolls back
// automatically.
export class ResizeConflictError extends Error {
  constructor(
    public readonly affectedCardCount: number,
    public readonly affectedArtCount: number,
  ) {
    super('The proposed binder size or page-count reduction affects placed items.');
  }
}
