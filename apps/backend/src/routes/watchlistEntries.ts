import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BULK_CARD_CREATE_CONCURRENCY,
  CARD_VARIATION_MAX_LENGTH,
  CUSTOM_CARD_NAME_MAX_LENGTH,
  CUSTOM_CARD_NUMBER_MAX_LENGTH,
  CUSTOM_CARD_SET_MAX_LENGTH,
  DEFAULT_CARD_IS_MANUAL_PRICE,
  POKEMONTCG_PRICE_FETCH_CONCURRENCY,
  WATCHLIST_PDF_MAX_ENTRIES,
} from '@binder-project-planner/shared';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { Router } from 'express';

import type { DatabaseConnection } from '../database/client.js';
import { appMetadata, cardImageAssets, cards, watchlistEntries } from '../database/schema.js';
import { fromCents, toCents } from '../finance/currency.js';
import {
  findIdempotentOutcome,
  saveIdempotentOutcome,
} from '../idempotency/mutationIdempotency.js';
import {
  createPriceFetchBatchCache,
  fetchCardPriceData,
  PokemonTcgAbortedError,
  PokemonTcgProviderError,
} from '../integrations/pokemontcg.js';
import { TcgDexProviderError } from '../integrations/tcgdex.js';
import { generateWatchlistPdf } from '../pdf/watchlistPdf.js';

import { mapWithConcurrencyLimit } from './concurrency.js';
import {
  isUniqueConstraintError,
  removeTemporaryUploads,
  resolveCardCatalogImageAsset,
  resolveCustomImageAsset,
  UnsupportedImageFormatError,
  type ResolvedImageAsset,
} from './cards.js';

type WatchlistEntryRow = typeof watchlistEntries.$inferSelect;
// Only the fields a referenced entry's hydration reads from its joined
// card - a full `CardRow` isn't needed here since placement/binderId/
// acquired are never surfaced through a `WatchlistEntry` (story 45).
type HydratingCardRow = Pick<
  typeof cards.$inferSelect,
  | 'id'
  | 'name'
  | 'setName'
  | 'localNumber'
  | 'source'
  | 'providerCardId'
  | 'providerSetId'
  | 'variation'
  | 'priceCents'
  | 'isManualPrice'
  | 'priceUpdatedAt'
>;

// One submitted card's independent creation outcome (story 45), mirroring
// `cards.ts`'s own `BulkCardOutcome` pattern.
type BulkWatchlistEntryOutcome =
  | { status: 'created'; entry: ReturnType<typeof serializeWatchlistEntry> }
  | { status: 'failed'; problem: ReturnType<typeof problem> };

// One submitted card id's independent add-by-reference outcome (story
// 45), mirroring `BulkWatchlistEntryOutcome` above but for
// `POST /cards/watchlist-entries/bulk` - `cardId` echoes which submitted
// id each outcome corresponds to, since (unlike the other bulk endpoint)
// there's no created entry to read it from when `status` is `failed`.
type BulkAddCardsToWatchlistOutcome =
  | { cardId: string; status: 'added'; entry: ReturnType<typeof serializeWatchlistEntry> }
  | { cardId: string; status: 'failed'; problem: ReturnType<typeof problem> };

// One submitted price update's independent outcome (story 45), mirroring
// `cards.ts`'s own `CardPriceUpdateOutcome` pattern.
type WatchlistEntryPriceUpdateOutcome =
  | { status: 'updated'; entry: ReturnType<typeof serializeWatchlistEntry> }
  | { status: 'failed'; problem: ReturnType<typeof problem> };

// The validated, OpenAPI-typed shape of a standalone create-entry request
// body (story 45, `multipart/form-data`), mirroring
// `CreateCustomCardRequestBody` minus placement/acquisition, which have no
// meaning for a binder-less entry.
interface CreateWatchlistEntryRequestBody {
  name: string;
  setName?: string;
  localNumber?: string;
  variation?: string;
}

// The validated, OpenAPI-typed shape of `PATCH /watchlist-entries/
// {watchlistEntryId}`'s request body (story 45), mirroring
// `UpdateCardDetailsRequestBody`.
interface UpdateWatchlistEntryRequestBody {
  name: string;
  setName?: string;
  localNumber?: string;
  variation?: string;
  price?: number;
}

// One normalized catalog result within a bulk request (story 45; story 43
// widens `source` beyond `tcgdex`), mirroring `cards.ts`'s own
// `BulkCardItem`.
interface BulkWatchlistCardItem {
  source: 'tcgdex' | 'pokemontcg';
  name: string;
  setName: string | null;
  localNumber: string | null;
  providerCardId: string;
  providerSetId: string;
  imageUrl: string;
}

interface BulkCreateWatchlistEntriesRequestBody {
  cards: BulkWatchlistCardItem[];
  variation?: string | null;
}

interface WatchlistEntryPriceFetchRequestBody {
  watchlistEntryIds: string[];
}

interface WatchlistEntryPriceUpdate {
  watchlistEntryId: string;
  price: number;
  isManualPrice: boolean;
}

interface UpdateWatchlistEntryPricesRequestBody {
  prices: WatchlistEntryPriceUpdate[];
}

function problem(status: number, title: string, detail: string) {
  return { type: 'about:blank', title, status, detail };
}

// Story 52's key for the persisted "how many entries currently sit above
// the PDF export divider" value, stored as a single row in the generic
// `app_metadata` key/value table (its first real use) rather than a new
// dedicated singleton table, since it's just one global integer.
const PDF_EXPORT_CUTOFF_COUNT_METADATA_KEY = 'watchlistPdfExportCutoffCount';

// The validated, OpenAPI-typed shape of `PATCH /watchlist-entries/
// order`'s request body (story 52): a full replacement of every entry's
// `sortOrder` (as a plain ordered id array, renumbered 0..n-1) plus the
// new divider position, applied together in one request/transaction.
interface UpdateWatchlistEntryOrderRequestBody {
  orderedEntryIds: string[];
  pdfExportCutoffCount: number;
}

// Serializes one persisted watchlist-entry row as the OpenAPI
// `WatchlistEntry` response shape (story 45). When `card` is supplied
// (the entry references an existing binder card), every display/edit
// field is hydrated from that card's own row instead of the entry's own
// (mostly-null, per the `watchlist_entry_standalone_or_referenced` CHECK
// constraint) columns - a referenced entry's price/name/etc. are always
// the card's current values, never a stale copy.
function serializeWatchlistEntry(entry: WatchlistEntryRow, card: HydratingCardRow | null) {
  const fields = card ?? entry;
  return {
    id: entry.id,
    cardId: entry.cardId,
    sortOrder: entry.sortOrder,
    name: fields.name!,
    setName: fields.setName,
    localNumber: fields.localNumber,
    source: fields.source!,
    providerCardId: fields.providerCardId,
    providerSetId: fields.providerSetId,
    variation: fields.variation,
    imageUrl: entry.cardId
      ? `/cards/${entry.cardId}/image`
      : `/watchlist-entries/${entry.id}/image`,
    price: fields.priceCents === null ? null : fromCents(fields.priceCents),
    isManualPrice: fields.isManualPrice,
    priceUpdatedAt: fields.priceUpdatedAt,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export function createWatchlistEntriesRouter(
  database: DatabaseConnection['database'],
  imagesDirectory: string,
  pokemonTcgApiKey: string | undefined,
): Router {
  const router = Router();

  // Looks up the joined card (if any) for a batch of entry rows in one
  // extra query, rather than one query per referenced entry.
  function loadCardsByIdForEntries(entryRows: WatchlistEntryRow[]): Map<string, HydratingCardRow> {
    const referencedCardIds = entryRows
      .map((entry) => entry.cardId)
      .filter((id): id is string => id !== null);
    if (referencedCardIds.length === 0) return new Map();
    const cardRows = database
      .select()
      .from(cards)
      .where(inArray(cards.id, referencedCardIds))
      .all();
    return new Map(cardRows.map((card) => [card.id, card]));
  }

  // The current total row count in `watchlist_entries`, used both to
  // assign a newly created entry's `sortOrder` (always appended at the
  // end) and as the upper bound when clamping the persisted PDF export
  // cutoff (story 52).
  function countWatchlistEntries(): number {
    const row = database
      .select({ count: sql<number>`count(*)` })
      .from(watchlistEntries)
      .get() as { count: number } | undefined;
    return row?.count ?? 0;
  }

  // Reads the persisted PDF export cutoff straight from `app_metadata`,
  // or `null` if no value has ever been written yet (story 52) - the
  // divider hasn't been dragged, so there's nothing to clamp/derive from
  // other than the caller's own default.
  function readStoredPdfExportCutoffCount(): number | null {
    const row = database
      .select({ value: appMetadata.value })
      .from(appMetadata)
      .where(eq(appMetadata.key, PDF_EXPORT_CUTOFF_COUNT_METADATA_KEY))
      .get();
    return row ? Number.parseInt(row.value, 10) : null;
  }

  // Story 52's divider position: the persisted `pdfExportCutoffCount`
  // (how many entries currently sit above the PDF export divider), read
  // fresh on every request rather than cached. Defaults to
  // `min(WATCHLIST_PDF_MAX_ENTRIES, totalEntryCount)` (the divider's
  // documented starting position) when nothing has ever been explicitly
  // persisted, and is always clamped to the list's *current* size and to
  // `WATCHLIST_PDF_MAX_ENTRIES` so a stored value never points past the
  // end of a list that has since shrunk, or exceeds the export's own hard
  // cap.
  function computePdfExportCutoffCount(totalEntryCount: number): number {
    const stored = readStoredPdfExportCutoffCount();
    const effective = stored ?? Math.min(WATCHLIST_PDF_MAX_ENTRIES, totalEntryCount);
    return Math.min(effective, WATCHLIST_PDF_MAX_ENTRIES, totalEntryCount);
  }

  // Upserts the persisted PDF export cutoff (story 52). `app_metadata` is
  // a plain key/value table with no prior read/write helpers in this
  // codebase, so this is a plain select-then-insert-or-update rather than
  // an ORM upsert helper, matching this file's existing style elsewhere.
  function writePdfExportCutoffCount(value: number): void {
    const existing = database
      .select({ key: appMetadata.key })
      .from(appMetadata)
      .where(eq(appMetadata.key, PDF_EXPORT_CUTOFF_COUNT_METADATA_KEY))
      .get();
    if (existing) {
      database
        .update(appMetadata)
        .set({ value: String(value) })
        .where(eq(appMetadata.key, PDF_EXPORT_CUTOFF_COUNT_METADATA_KEY))
        .run();
    } else {
      database
        .insert(appMetadata)
        .values({ key: PDF_EXPORT_CUTOFF_COUNT_METADATA_KEY, value: String(value) })
        .run();
    }
  }

  // Called right after inserting `createdCount` new entries (1 for the
  // single-entry create endpoints, or however many succeeded for a bulk
  // one), story 52. If the divider was already sitting at the true end of
  // the list (no entries below it) and there's still room under
  // `WATCHLIST_PDF_MAX_ENTRIES`, extends it to also cover as many of the
  // newly appended entries as fit - otherwise (the user has moved the
  // divider up, or the list is already at the cap) leaves it unchanged,
  // so new entries land below it instead.
  function extendPdfExportCutoffForNewEntries(
    previousTotalEntryCount: number,
    createdCount: number,
  ): void {
    if (createdCount === 0) return;
    const previousCutoff = computePdfExportCutoffCount(previousTotalEntryCount);
    if (previousCutoff !== previousTotalEntryCount) return;
    const nextCutoff = Math.min(previousCutoff + createdCount, WATCHLIST_PDF_MAX_ENTRIES);
    if (nextCutoff !== previousCutoff) {
      writePdfExportCutoffCount(nextCutoff);
    }
  }

  // Story 45's main list endpoint: every entry on the shared list, both
  // standalone and referenced, hydrated from their joined card where
  // applicable. Ordered by each entry's persisted `sortOrder` (story
  // 52's drag-and-drop position) - the frontend applies its own active
  // column sort on top of this, or falls back to this order when no
  // column sort is active. The response also carries the persisted PDF
  // export divider position alongside the entries, since it's one global
  // value rather than a per-entry field.
  router.get('/watchlist-entries', (_request, response) => {
    const entryRows = database
      .select()
      .from(watchlistEntries)
      .orderBy(asc(watchlistEntries.sortOrder))
      .all();
    const cardsById = loadCardsByIdForEntries(entryRows);

    response.status(200).json({
      entries: entryRows.map((entry) =>
        serializeWatchlistEntry(entry, entry.cardId ? (cardsById.get(entry.cardId) ?? null) : null),
      ),
      pdfExportCutoffCount: computePdfExportCutoffCount(entryRows.length),
    });
  });

  // Story 52's single reorder endpoint: replaces every entry's persisted
  // `sortOrder` from the submitted array's own order (renumbered 0..n-1)
  // and updates the persisted PDF export divider position, together in
  // one transaction - covers both a plain entry drag (only
  // `orderedEntryIds` changes) and a divider drag (only
  // `pdfExportCutoffCount` changes) with a single request shape, since the
  // frontend always has both values in hand after any drag-end.
  router.patch('/watchlist-entries/order', (request, response) => {
    const body = request.body as UpdateWatchlistEntryOrderRequestBody;
    const { orderedEntryIds, pdfExportCutoffCount } = body;

    const existingIds = database
      .select({ id: watchlistEntries.id })
      .from(watchlistEntries)
      .all()
      .map((row) => row.id);
    const existingIdSet = new Set(existingIds);
    const orderedIdSet = new Set(orderedEntryIds);

    // `orderedEntryIds` must be exactly a reordering of every current
    // entry id - same length, no duplicates, no unknown/missing ids -
    // otherwise this request can't be a valid full-order replacement.
    const isExactReordering =
      orderedEntryIds.length === existingIds.length &&
      orderedIdSet.size === orderedEntryIds.length &&
      orderedEntryIds.every((id) => existingIdSet.has(id));
    if (!isExactReordering) {
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            'orderedEntryIds must contain every current watchlist entry id exactly once.',
          ),
        );
      return;
    }

    const maxPdfExportCutoffCount = Math.min(WATCHLIST_PDF_MAX_ENTRIES, orderedEntryIds.length);
    if (
      !Number.isInteger(pdfExportCutoffCount) ||
      pdfExportCutoffCount < 0 ||
      pdfExportCutoffCount > maxPdfExportCutoffCount
    ) {
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `pdfExportCutoffCount must be an integer between 0 and ${maxPdfExportCutoffCount}.`,
          ),
        );
      return;
    }

    database.transaction((tx) => {
      orderedEntryIds.forEach((id, index) => {
        tx.update(watchlistEntries)
          .set({ sortOrder: index })
          .where(eq(watchlistEntries.id, id))
          .run();
      });

      // Inlined rather than reusing `writePdfExportCutoffCount` - that
      // helper always runs against the router's own top-level `database`,
      // never this callback's `tx`, so the read-then-write below stays
      // inside this same transaction instead.
      const existingMetadataRow = tx
        .select({ key: appMetadata.key })
        .from(appMetadata)
        .where(eq(appMetadata.key, PDF_EXPORT_CUTOFF_COUNT_METADATA_KEY))
        .get();
      if (existingMetadataRow) {
        tx.update(appMetadata)
          .set({ value: String(pdfExportCutoffCount) })
          .where(eq(appMetadata.key, PDF_EXPORT_CUTOFF_COUNT_METADATA_KEY))
          .run();
      } else {
        tx.insert(appMetadata)
          .values({
            key: PDF_EXPORT_CUTOFF_COUNT_METADATA_KEY,
            value: String(pdfExportCutoffCount),
          })
          .run();
      }
    });

    response.status(200).json({ pdfExportCutoffCount });
  });

  // Story 45's "Add to What I'm Looking For" Card List row action: creates
  // a new entry referencing the path card, or returns the existing entry
  // unchanged if this exact card is already on the list - an exact-match
  // check on `cardId` (enforced by the table's own unique index), not a
  // name/set/number heuristic, so this never creates a duplicate
  // reference.
  router.post('/cards/:cardId/watchlist-entry', (request, response) => {
    const { cardId } = request.params;
    const card = database.select().from(cards).where(eq(cards.id, cardId)).get();
    if (!card) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No card exists with id "${cardId}".`));
      return;
    }

    const existing = database
      .select()
      .from(watchlistEntries)
      .where(eq(watchlistEntries.cardId, cardId))
      .get();
    if (existing) {
      response.status(200).json(serializeWatchlistEntry(existing, card));
      return;
    }

    const previousTotalEntryCount = countWatchlistEntries();
    const now = new Date().toISOString();
    const entry: WatchlistEntryRow = {
      id: randomUUID(),
      cardId,
      // Story 52: newly created entries are always appended at the end of
      // the persisted drag order.
      sortOrder: previousTotalEntryCount,
      name: null,
      setName: null,
      localNumber: null,
      source: null,
      providerCardId: null,
      providerSetId: null,
      variation: null,
      imageAssetId: null,
      priceCents: null,
      isManualPrice: DEFAULT_CARD_IS_MANUAL_PRICE,
      priceUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      database.insert(watchlistEntries).values(entry).run();
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        // Lost a concurrent race to reference the same card; return the
        // winner's entry instead of failing.
        const winner = database
          .select()
          .from(watchlistEntries)
          .where(eq(watchlistEntries.cardId, cardId))
          .get();
        if (winner) {
          response.status(200).json(serializeWatchlistEntry(winner, card));
          return;
        }
      }
      throw error;
    }

    extendPdfExportCutoffForNewEntries(previousTotalEntryCount, 1);
    response.status(200).json(serializeWatchlistEntry(entry, card));
  });

  // Story 45's bulk variant of the row action above: adds every submitted
  // card id to the list by reference, each independently and
  // idempotently (a card id already listed is a no-op, its existing entry
  // returned unchanged, matching the single-card endpoint's own
  // behavior). One id that doesn't identify a card fails only that item -
  // the response preserves the request's own `cardIds` order regardless
  // of which items succeeded or failed.
  router.post('/cards/watchlist-entries/bulk', (request, response) => {
    const { cardIds } = request.body as { cardIds: string[] };

    // Story 52: entries newly created within this batch are appended at
    // the end of the persisted drag order in their submitted-array order;
    // `nextSortOrder` tracks the running end-of-list position across the
    // loop, and `newlyCreatedCount` (distinct from the outcome count,
    // since an already-listed card's outcome is also `status: 'added'`)
    // tracks how many actually inserted a new row, for extending the PDF
    // export cutoff afterward.
    const initialTotalEntryCount = countWatchlistEntries();
    let nextSortOrder = initialTotalEntryCount;
    let newlyCreatedCount = 0;

    const outcomes: BulkAddCardsToWatchlistOutcome[] = cardIds.map((cardId) => {
      const card = database.select().from(cards).where(eq(cards.id, cardId)).get();
      if (!card) {
        return {
          cardId,
          status: 'failed',
          problem: problem(404, 'Not Found', `No card exists with id "${cardId}".`),
        };
      }

      const existing = database
        .select()
        .from(watchlistEntries)
        .where(eq(watchlistEntries.cardId, cardId))
        .get();
      if (existing) {
        return { cardId, status: 'added', entry: serializeWatchlistEntry(existing, card) };
      }

      const now = new Date().toISOString();
      const entry: WatchlistEntryRow = {
        id: randomUUID(),
        cardId,
        sortOrder: nextSortOrder,
        name: null,
        setName: null,
        localNumber: null,
        source: null,
        providerCardId: null,
        providerSetId: null,
        variation: null,
        imageAssetId: null,
        priceCents: null,
        isManualPrice: DEFAULT_CARD_IS_MANUAL_PRICE,
        priceUpdatedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      try {
        database.insert(watchlistEntries).values(entry).run();
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          // Lost a race - either to another id in this same batch
          // resolving to the same card, or a concurrent request - to
          // reference this card; return the winner's entry instead of
          // failing this item, matching the single-card endpoint's own
          // race handling.
          const winner = database
            .select()
            .from(watchlistEntries)
            .where(eq(watchlistEntries.cardId, cardId))
            .get();
          if (winner) {
            return { cardId, status: 'added', entry: serializeWatchlistEntry(winner, card) };
          }
        }
        throw error;
      }

      nextSortOrder += 1;
      newlyCreatedCount += 1;
      return { cardId, status: 'added', entry: serializeWatchlistEntry(entry, card) };
    });

    extendPdfExportCutoffForNewEntries(initialTotalEntryCount, newlyCreatedCount);

    const responseStatus = outcomes.some((outcome) => outcome.status === 'failed') ? 207 : 201;
    response.status(responseStatus).json(outcomes);
  });

  // Story 45's standalone manual-entry endpoint (`multipart/form-data`),
  // mirroring `POST /binders/{binderId}/cards`'s custom-card branch minus
  // placement and acquisition, which have no meaning for a binder-less
  // entry.
  router.post('/watchlist-entries', (request, response) => {
    const uploadedFiles = Array.isArray(request.files) ? request.files : undefined;
    if (!uploadedFiles) {
      // Never expected: the OpenAPI schema only documents a
      // `multipart/form-data` request body, so express-openapi-validator
      // already rejects any other content type before this handler runs.
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'This endpoint requires a multipart/form-data body.'));
      return;
    }

    const body = request.body as CreateWatchlistEntryRequestBody;
    const uploadedFile = uploadedFiles.find((file) => file.fieldname === 'image');
    if (!uploadedFile) {
      // Never expected: the OpenAPI schema requires `image`.
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'A standalone entry requires an image file.'));
      return;
    }

    const name = body.name.trim();
    if (!name) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'name is required.'));
      return;
    }
    if (name.length > CUSTOM_CARD_NAME_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `name must be ${CUSTOM_CARD_NAME_MAX_LENGTH} characters or fewer.`,
          ),
        );
      return;
    }

    const setName = body.setName?.trim() || null;
    const localNumber = body.localNumber?.trim() || null;
    const variation = body.variation?.trim() || null;

    if (setName && setName.length > CUSTOM_CARD_SET_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `setName must be ${CUSTOM_CARD_SET_MAX_LENGTH} characters or fewer.`,
          ),
        );
      return;
    }
    if (localNumber && localNumber.length > CUSTOM_CARD_NUMBER_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `localNumber must be ${CUSTOM_CARD_NUMBER_MAX_LENGTH} characters or fewer.`,
          ),
        );
      return;
    }
    if (variation && variation.length > CARD_VARIATION_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `variation must be ${CARD_VARIATION_MAX_LENGTH} characters or fewer.`,
          ),
        );
      return;
    }

    let asset: ResolvedImageAsset;
    try {
      asset = resolveCustomImageAsset(database, imagesDirectory, uploadedFile);
    } catch (error) {
      if (error instanceof UnsupportedImageFormatError) {
        response
          .status(415)
          .type('application/problem+json')
          .json(problem(415, 'Unsupported Media Type', error.message));
        return;
      }
      throw error;
    }

    const previousTotalEntryCount = countWatchlistEntries();
    const now = new Date().toISOString();
    const entry: WatchlistEntryRow = {
      id: randomUUID(),
      cardId: null,
      sortOrder: previousTotalEntryCount,
      name,
      setName,
      localNumber,
      source: 'custom',
      providerCardId: null,
      providerSetId: null,
      variation,
      imageAssetId: asset.assetId,
      priceCents: null,
      isManualPrice: DEFAULT_CARD_IS_MANUAL_PRICE,
      priceUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      database.insert(watchlistEntries).values(entry).run();
    } catch (error) {
      // The image asset row/file this request just created is otherwise
      // unreferenced once the insert fails, so it's removed rather than
      // left orphaned, mirroring `cards.ts`'s own insert-failure cleanup.
      if (asset.newlyCreatedFilePath) {
        unlinkSync(asset.newlyCreatedFilePath);
        database.delete(cardImageAssets).where(eq(cardImageAssets.id, asset.assetId)).run();
      }
      throw error;
    }

    extendPdfExportCutoffForNewEntries(previousTotalEntryCount, 1);
    response
      .status(201)
      .location(`/watchlist-entries/${entry.id}`)
      .json(serializeWatchlistEntry(entry, null));
  });

  // Story 45's standalone bulk TCGdex-entry endpoint, mirroring
  // `POST /binders/{binderId}/cards/bulk`'s per-item independent-outcome
  // pattern minus placement/acquisition/per-binder guard, none of which
  // apply to a binder-less entry.
  router.post('/watchlist-entries/bulk', async (request, response) => {
    const idempotencyKey = request.header('Idempotency-Key');
    if (!idempotencyKey) {
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'An Idempotency-Key header is required.'));
      return;
    }

    const replayed = findIdempotentOutcome(
      database,
      'bulk-create-watchlist-entries',
      idempotencyKey,
    );
    if (replayed) {
      response.status(replayed.responseStatus).json(replayed.responseBody);
      return;
    }

    const body = request.body as BulkCreateWatchlistEntriesRequestBody;
    const variation = body.variation?.trim() || null;
    if (variation && variation.length > CARD_VARIATION_MAX_LENGTH) {
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `variation must be ${CARD_VARIATION_MAX_LENGTH} characters or fewer.`,
          ),
        );
      return;
    }

    // Mirrors the bulk create-cards endpoint's own never-aborted signal
    // (planning.md: an accepted bulk request keeps running to completion
    // even if the client disconnects); each TCGdex request is still
    // bounded by its own internal timeout.
    const neverAbortedSignal = new AbortController().signal;

    // Story 52: sortOrder is assigned from each item's position in the
    // *submitted* `body.cards` array (not completion order, which varies
    // with `mapWithConcurrencyLimit`'s concurrency), so the outcome is
    // deterministic regardless of which network requests finish first. A
    // failed item's index is simply skipped, leaving a harmless gap in
    // the value space rather than a used sortOrder.
    const initialTotalEntryCount = countWatchlistEntries();

    const outcomes = await mapWithConcurrencyLimit(
      body.cards,
      BULK_CARD_CREATE_CONCURRENCY,
      async (item, index): Promise<BulkWatchlistEntryOutcome> => {
        let asset: ResolvedImageAsset;
        try {
          asset = await resolveCardCatalogImageAsset(
            database,
            imagesDirectory,
            item,
            neverAbortedSignal,
          );
        } catch (error) {
          if (error instanceof TcgDexProviderError || error instanceof PokemonTcgProviderError) {
            const status = error.isTimeout ? 504 : 502;
            return { status: 'failed', problem: problem(status, 'Bad Gateway', error.message) };
          }
          throw error;
        }

        const now = new Date().toISOString();
        const entry: WatchlistEntryRow = {
          id: randomUUID(),
          cardId: null,
          sortOrder: initialTotalEntryCount + index,
          name: item.name,
          setName: item.setName,
          localNumber: item.localNumber,
          source: item.source,
          providerCardId: item.providerCardId,
          providerSetId: item.providerSetId,
          variation,
          imageAssetId: asset.assetId,
          priceCents: null,
          isManualPrice: DEFAULT_CARD_IS_MANUAL_PRICE,
          priceUpdatedAt: null,
          createdAt: now,
          updatedAt: now,
        };

        try {
          database.insert(watchlistEntries).values(entry).run();
        } catch (error) {
          if (asset.newlyCreatedFilePath) {
            unlinkSync(asset.newlyCreatedFilePath);
            database.delete(cardImageAssets).where(eq(cardImageAssets.id, asset.assetId)).run();
          }
          throw error;
        }

        return { status: 'created', entry: serializeWatchlistEntry(entry, null) };
      },
    );

    extendPdfExportCutoffForNewEntries(
      initialTotalEntryCount,
      outcomes.filter((outcome) => outcome.status === 'created').length,
    );

    const responseStatus = outcomes.some((outcome) => outcome.status === 'failed') ? 207 : 201;
    saveIdempotentOutcome(database, 'bulk-create-watchlist-entries', idempotencyKey, {
      responseStatus,
      responseBody: outcomes,
      locationHeader: null,
    });
    response.status(responseStatus).json(outcomes);
  });

  // Story 45's standalone-entry edit endpoint (`multipart/form-data`),
  // mirroring `PATCH /cards/{cardId}/details`. Only valid for a standalone
  // entry - a referenced entry's fields are instead edited through its own
  // card via the existing card endpoints, since they write through to the
  // same underlying `Card` row.
  router.patch('/watchlist-entries/:watchlistEntryId', (request, response) => {
    const { watchlistEntryId } = request.params;
    const uploadedFiles = Array.isArray(request.files) ? request.files : undefined;

    const existing = database
      .select()
      .from(watchlistEntries)
      .where(eq(watchlistEntries.id, watchlistEntryId))
      .get();
    if (!existing) {
      if (uploadedFiles) removeTemporaryUploads(uploadedFiles);
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No entry exists with id "${watchlistEntryId}".`));
      return;
    }
    if (existing.cardId !== null) {
      if (uploadedFiles) removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            'Referenced entries are edited through their card, not this endpoint.',
          ),
        );
      return;
    }

    if (!uploadedFiles) {
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'This endpoint requires a multipart/form-data body.'));
      return;
    }

    const body = request.body as UpdateWatchlistEntryRequestBody;
    const name = body.name.trim();
    if (!name) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'name is required.'));
      return;
    }
    if (name.length > CUSTOM_CARD_NAME_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `name must be ${CUSTOM_CARD_NAME_MAX_LENGTH} characters or fewer.`,
          ),
        );
      return;
    }

    const setName = body.setName?.trim() || null;
    const localNumber = body.localNumber?.trim() || null;
    const variation = body.variation?.trim() || null;

    if (setName && setName.length > CUSTOM_CARD_SET_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `setName must be ${CUSTOM_CARD_SET_MAX_LENGTH} characters or fewer.`,
          ),
        );
      return;
    }
    if (localNumber && localNumber.length > CUSTOM_CARD_NUMBER_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `localNumber must be ${CUSTOM_CARD_NUMBER_MAX_LENGTH} characters or fewer.`,
          ),
        );
      return;
    }
    if (variation && variation.length > CARD_VARIATION_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `variation must be ${CARD_VARIATION_MAX_LENGTH} characters or fewer.`,
          ),
        );
      return;
    }

    let asset: ResolvedImageAsset | null = null;
    const uploadedFile = uploadedFiles.find((file) => file.fieldname === 'image');
    if (uploadedFile) {
      try {
        asset = resolveCustomImageAsset(database, imagesDirectory, uploadedFile);
      } catch (error) {
        if (error instanceof UnsupportedImageFormatError) {
          response
            .status(415)
            .type('application/problem+json')
            .json(problem(415, 'Unsupported Media Type', error.message));
          return;
        }
        throw error;
      }
    }

    const priceCents = body.price === undefined ? null : toCents(body.price);
    const priceChanged = priceCents !== existing.priceCents;
    const now = new Date().toISOString();
    const isManualPrice = priceChanged ? true : existing.isManualPrice;
    const priceUpdatedAt = priceChanged ? now : existing.priceUpdatedAt;

    const updateValues = {
      name,
      setName,
      localNumber,
      variation,
      priceCents,
      isManualPrice,
      priceUpdatedAt,
      updatedAt: now,
      ...(asset ? { imageAssetId: asset.assetId } : {}),
    };

    // Mirrors `PATCH /cards/{cardId}/details`'s orphan-cleanup pattern:
    // only relevant when a new image replaces (rather than reuses, via
    // digest dedupe) the entry's previous asset. Image assets are shared
    // globally by digest across both `cards` and `watchlist_entries`, so
    // the "still referenced" check below covers both tables, not just
    // this one.
    const previousImageAssetId = existing.imageAssetId;
    const orphanedFilePath = database.transaction((tx) => {
      tx.update(watchlistEntries)
        .set(updateValues)
        .where(eq(watchlistEntries.id, watchlistEntryId))
        .run();

      if (!asset || !previousImageAssetId || asset.assetId === previousImageAssetId) return null;

      const stillReferencedByCard = tx
        .select({ id: cards.id })
        .from(cards)
        .where(eq(cards.imageAssetId, previousImageAssetId))
        .get();
      const stillReferencedByEntry = tx
        .select({ id: watchlistEntries.id })
        .from(watchlistEntries)
        .where(eq(watchlistEntries.imageAssetId, previousImageAssetId))
        .get();
      if (stillReferencedByCard || stillReferencedByEntry) return null;

      const oldAsset = tx
        .select({ storageFilename: cardImageAssets.storageFilename })
        .from(cardImageAssets)
        .where(eq(cardImageAssets.id, previousImageAssetId))
        .get();
      tx.delete(cardImageAssets).where(eq(cardImageAssets.id, previousImageAssetId)).run();
      return oldAsset ? join(imagesDirectory, oldAsset.storageFilename) : null;
    });

    if (orphanedFilePath && existsSync(orphanedFilePath)) {
      try {
        unlinkSync(orphanedFilePath);
      } catch (error) {
        request.log.error(
          { err: error, path: orphanedFilePath },
          'Failed to delete an orphaned watchlist-entry image file after an entry edit.',
        );
      }
    }

    response.status(200).json(serializeWatchlistEntry({ ...existing, ...updateValues }, null));
  });

  // Story 45's removal endpoint, handling both entry kinds. For a
  // standalone entry, this is a complete deletion - nothing else
  // references its row, so its owned image asset is also removed if this
  // was its last reference (mirroring `DELETE /cards/{cardId}`). For a
  // referenced entry, only this reference is removed; the underlying card
  // is untouched. Deleting an already-absent entry also returns `204`.
  router.delete('/watchlist-entries/:watchlistEntryId', (request, response) => {
    const { watchlistEntryId } = request.params;

    const orphanedFilePath = database.transaction((tx) => {
      const entry = tx
        .select({ cardId: watchlistEntries.cardId, imageAssetId: watchlistEntries.imageAssetId })
        .from(watchlistEntries)
        .where(eq(watchlistEntries.id, watchlistEntryId))
        .get();
      if (!entry) return null;

      tx.delete(watchlistEntries).where(eq(watchlistEntries.id, watchlistEntryId)).run();

      // A referenced entry has no own image asset to clean up (`cardId`
      // set implies `imageAssetId` null, per the table's own CHECK
      // constraint).
      if (entry.cardId !== null || !entry.imageAssetId) return null;

      const stillReferencedByCard = tx
        .select({ id: cards.id })
        .from(cards)
        .where(eq(cards.imageAssetId, entry.imageAssetId))
        .get();
      const stillReferencedByEntry = tx
        .select({ id: watchlistEntries.id })
        .from(watchlistEntries)
        .where(eq(watchlistEntries.imageAssetId, entry.imageAssetId))
        .get();
      if (stillReferencedByCard || stillReferencedByEntry) return null;

      const asset = tx
        .select({ storageFilename: cardImageAssets.storageFilename })
        .from(cardImageAssets)
        .where(eq(cardImageAssets.id, entry.imageAssetId))
        .get();
      tx.delete(cardImageAssets).where(eq(cardImageAssets.id, entry.imageAssetId)).run();
      return asset ? join(imagesDirectory, asset.storageFilename) : null;
    });

    if (orphanedFilePath && existsSync(orphanedFilePath)) {
      try {
        unlinkSync(orphanedFilePath);
      } catch (error) {
        request.log.error(
          { err: error, path: orphanedFilePath },
          'Failed to delete an orphaned watchlist-entry image file after entry deletion.',
        );
      }
    }

    response.status(204).end();
  });

  // Story 45's "mark as acquired" action: only valid for a referenced
  // entry - sets its card's `acquired` field and removes the entry in one
  // transaction, so a partial failure can't leave one change applied
  // without the other.
  router.post('/watchlist-entries/:watchlistEntryId/mark-acquired', (request, response) => {
    const { watchlistEntryId } = request.params;
    const entry = database
      .select()
      .from(watchlistEntries)
      .where(eq(watchlistEntries.id, watchlistEntryId))
      .get();
    if (!entry) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No entry exists with id "${watchlistEntryId}".`));
      return;
    }
    if (entry.cardId === null) {
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(400, 'Bad Request', 'This entry is standalone and has no card to mark acquired.'),
        );
      return;
    }

    const now = new Date().toISOString();
    database.transaction((tx) => {
      tx.update(cards)
        .set({ acquired: true, updatedAt: now })
        .where(eq(cards.id, entry.cardId!))
        .run();
      tx.delete(watchlistEntries).where(eq(watchlistEntries.id, watchlistEntryId)).run();
    });

    response.status(204).end();
  });

  // Story 45's standalone-entry image-streaming endpoint, mirroring
  // `GET /cards/{cardId}/image`. A referenced entry has no own image
  // asset (per the table's CHECK constraint), so the join below naturally
  // excludes it - its `imageUrl` instead points at its card's own image
  // endpoint.
  router.get('/watchlist-entries/:watchlistEntryId/image', (request, response) => {
    const { watchlistEntryId } = request.params;
    const row = database
      .select({
        contentType: cardImageAssets.contentType,
        storageFilename: cardImageAssets.storageFilename,
      })
      .from(watchlistEntries)
      .innerJoin(cardImageAssets, eq(watchlistEntries.imageAssetId, cardImageAssets.id))
      .where(eq(watchlistEntries.id, watchlistEntryId))
      .get();

    if (!row) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No entry exists with id "${watchlistEntryId}".`));
      return;
    }

    const filePath = join(imagesDirectory, row.storageFilename);
    if (!existsSync(filePath)) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', 'The entry image file is missing from local storage.'));
      return;
    }

    response
      .status(200)
      .type(row.contentType)
      .set('Cache-Control', 'public, max-age=31536000, immutable');
    createReadStream(filePath).pipe(response);
  });

  // Story 45's print/export PDF endpoint: renders the request's submitted
  // entry ids, in the exact order submitted (the client already resolved
  // the list's current search/filter and manual-drag-or-column-sort order
  // into that id order), as a fixed 2-page US Letter portrait PDF -
  // mirroring `exports/cards-pdf`'s "client resolves order, backend never
  // recomputes it" contract, but for a binder-less, global list. Read-only,
  // so (like the other export routes) never restricted by any lock state.
  router.post('/watchlist-entries/exports/pdf', async (request, response, next) => {
    const { watchlistEntryIds: requestedEntryIds } = request.body as {
      watchlistEntryIds: string[];
    };

    if (requestedEntryIds.length === 0) {
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'watchlistEntryIds must include at least one entry id.'));
      return;
    }

    // The frontend table already only ever sends the first
    // `WATCHLIST_PDF_MAX_ENTRIES` (the most page 1's fixed layout can fit
    // without a row running off the page - see `watchlistPdf.ts`), but the
    // route re-enforces the same cap server-side rather than trusting the
    // client, silently truncating a longer request instead of rejecting it
    // outright.
    const watchlistEntryIds = requestedEntryIds.slice(0, WATCHLIST_PDF_MAX_ENTRIES);

    // One transactionally consistent snapshot read, matching
    // `exports/cards-pdf`'s own snapshot-then-validate pattern.
    const snapshot = database.transaction((tx) => {
      const entryRows = tx
        .select()
        .from(watchlistEntries)
        .where(inArray(watchlistEntries.id, watchlistEntryIds))
        .all();
      const entriesById = new Map(entryRows.map((entry) => [entry.id, entry]));

      const referencedCardIds = entryRows
        .map((entry) => entry.cardId)
        .filter((id): id is string => id !== null);
      const cardRows =
        referencedCardIds.length > 0
          ? tx.select().from(cards).where(inArray(cards.id, referencedCardIds)).all()
          : [];
      const cardsById = new Map(cardRows.map((card) => [card.id, card]));

      // Every entry's effective image asset id - its joined card's own
      // asset when referenced, or its own asset when standalone - resolved
      // in one extra query rather than one per entry.
      const imageAssetIds = entryRows
        .map((entry) => {
          const card = entry.cardId ? cardsById.get(entry.cardId) : undefined;
          return card ? card.imageAssetId : entry.imageAssetId;
        })
        .filter((id): id is string => id !== null);
      const imageAssetRows =
        imageAssetIds.length > 0
          ? tx
              .select()
              .from(cardImageAssets)
              .where(inArray(cardImageAssets.id, imageAssetIds))
              .all()
          : [];
      const imageAssetsById = new Map(imageAssetRows.map((asset) => [asset.id, asset]));

      return { entriesById, cardsById, imageAssetsById };
    });

    // Every submitted id must currently identify an entry, and the array
    // must be non-empty (checked above), matching `exports/cards-pdf`'s
    // identical `cardIds` validation.
    const unknownEntryId = watchlistEntryIds.find((id) => !snapshot.entriesById.has(id));
    if (unknownEntryId !== undefined) {
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `Watchlist entry id "${unknownEntryId}" does not currently identify an entry.`,
          ),
        );
      return;
    }

    // Resolves each entry's effective (card-hydrated, or its own)
    // name/set/number/variation/price/image, in the exact submitted order -
    // mirroring `serializeWatchlistEntry`'s own card-hydration precedence.
    const pdfEntries = watchlistEntryIds.map((id) => {
      const entry = snapshot.entriesById.get(id)!;
      const card = entry.cardId ? snapshot.cardsById.get(entry.cardId) : undefined;
      const fields = card ?? entry;
      const imageAssetId = card ? card.imageAssetId : entry.imageAssetId;
      const imageAsset = imageAssetId ? snapshot.imageAssetsById.get(imageAssetId) : undefined;
      return {
        name: fields.name!,
        setName: fields.setName,
        localNumber: fields.localNumber,
        variation: fields.variation,
        price: fields.priceCents === null ? null : fromCents(fields.priceCents),
        // Every entry (standalone or referenced) always has an image asset
        // per the table's own schema, so this is only ever undefined if
        // local storage is already missing the file - `loadImageForEmbedding`
        // (inside `generateWatchlistPdf`) surfaces that as a PDF generation
        // failure below rather than this route guessing at a placeholder.
        imagePath: imageAsset ? join(imagesDirectory, imageAsset.storageFilename) : '',
      };
    });

    const tempFilePath = join(tmpdir(), `watchlist-pdf-export-${randomUUID()}.pdf`);

    try {
      await generateWatchlistPdf({ outputPath: tempFilePath, entries: pdfEntries });
    } catch (error) {
      if (existsSync(tempFilePath)) {
        try {
          unlinkSync(tempFilePath);
        } catch (cleanupError) {
          request.log.error(
            { err: cleanupError, path: tempFilePath },
            'Failed to remove a failed watchlist PDF export temporary file.',
          );
        }
      }
      next(error);
      return;
    }

    response
      .status(200)
      .type('application/pdf')
      .set('Content-Disposition', 'attachment; filename="whats-im-looking-for.pdf"');

    const readStream = createReadStream(tempFilePath);
    readStream.pipe(response);

    // Cleans up the temporary file once the response is done, matching
    // `exports/cards-pdf`'s identical cleanup above.
    response.once('close', () => {
      if (!existsSync(tempFilePath)) return;
      try {
        unlinkSync(tempFilePath);
      } catch (cleanupError) {
        request.log.error(
          { err: cleanupError, path: tempFilePath },
          'Failed to remove a completed watchlist PDF export temporary file.',
        );
      }
    });
  });

  // Story 45's price-fetch endpoint, mirroring `POST /binders/{binderId}/
  // cards/prices/fetch` (story 38) but generalized across entries that
  // may reference cards from many different binders, or no binder at all
  // - each entry's effective set/number identity comes from its joined
  // card when referenced, or its own columns when standalone. Nothing is
  // persisted by this endpoint.
  router.post('/watchlist-entries/prices/fetch', async (request, response) => {
    const body = request.body as WatchlistEntryPriceFetchRequestBody;

    const entryRows = database
      .select()
      .from(watchlistEntries)
      .where(inArray(watchlistEntries.id, body.watchlistEntryIds))
      .all();
    const entriesById = new Map(entryRows.map((entry) => [entry.id, entry]));
    const missingId = body.watchlistEntryIds.find((id) => !entriesById.has(id));
    if (missingId) {
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', `No entry exists with id "${missingId}".`));
      return;
    }
    const cardsById = loadCardsByIdForEntries(entryRows);

    const controller = new AbortController();
    request.on('close', () => controller.abort());
    // Shared across every entry in this request so entries resolving to
    // the same pokemontcg.io card share a single upstream lookup, mirroring
    // `POST /binders/{binderId}/cards/prices/fetch`'s own batch cache.
    const priceFetchBatchCache = createPriceFetchBatchCache();

    try {
      const results = await mapWithConcurrencyLimit(
        body.watchlistEntryIds,
        POKEMONTCG_PRICE_FETCH_CONCURRENCY,
        (watchlistEntryId) => {
          const entry = entriesById.get(watchlistEntryId)!;
          const fields = entry.cardId ? cardsById.get(entry.cardId) : undefined;
          return fetchCardPriceData(
            {
              // `fetchCardPriceData` passes `cardId` straight through as
              // a correlation id, never validating it against the `cards`
              // table - safe to key by `watchlistEntryId` here instead.
              cardId: watchlistEntryId,
              setName: fields ? fields.setName : entry.setName,
              providerSetId: fields ? fields.providerSetId : entry.providerSetId,
              localNumber: fields ? fields.localNumber : entry.localNumber,
            },
            pokemonTcgApiKey,
            controller.signal,
            priceFetchBatchCache,
          );
        },
      );
      response.status(200).json(
        results.map((result) => ({
          watchlistEntryId: result.cardId,
          tcgplayerUrl: result.tcgplayerUrl,
          variants: result.variants.map((variant) => ({
            variantKey: variant.variantKey,
            marketPrice:
              variant.marketPriceCents === null ? null : fromCents(variant.marketPriceCents),
            lowPrice: variant.lowPriceCents === null ? null : fromCents(variant.lowPriceCents),
          })),
        })),
      );
    } catch (error) {
      if (error instanceof PokemonTcgAbortedError) return;
      throw error;
    }
  });

  // Story 45's "Save all" endpoint, mirroring `PATCH /binders/{binderId}/
  // cards/prices` (story 38): a referenced entry's update is written to
  // its underlying card (visible back on that card's own binder Card
  // List); a standalone entry's update is written to its own columns.
  // Each submitted price is applied independently, so a failure on one
  // entry rolls back only that entry rather than the whole batch.
  router.patch('/watchlist-entries/prices', (request, response) => {
    const body = request.body as UpdateWatchlistEntryPricesRequestBody;

    const requestedIds = body.prices.map((entry) => entry.watchlistEntryId);
    const entryRows = database
      .select()
      .from(watchlistEntries)
      .where(inArray(watchlistEntries.id, requestedIds))
      .all();
    const entriesById = new Map(entryRows.map((entry) => [entry.id, entry]));
    const cardsById = loadCardsByIdForEntries(entryRows);

    const updatedAt = new Date().toISOString();
    const outcomes: WatchlistEntryPriceUpdateOutcome[] = body.prices.map((item) => {
      const entry = entriesById.get(item.watchlistEntryId);
      if (!entry) {
        return {
          status: 'failed',
          problem: problem(404, 'Not Found', `No entry exists with id "${item.watchlistEntryId}".`),
        };
      }

      const priceCents = toCents(item.price);

      if (entry.cardId !== null) {
        const card = cardsById.get(entry.cardId);
        if (!card) {
          // Never expected: the FK's `onDelete: 'cascade'` removes a
          // referenced entry whenever its card is deleted, so a dangling
          // reference shouldn't be observable. Guarded defensively.
          return {
            status: 'failed',
            problem: problem(
              404,
              'Not Found',
              `No card exists for watchlist entry "${item.watchlistEntryId}".`,
            ),
          };
        }
        database
          .update(cards)
          .set({
            priceCents,
            isManualPrice: item.isManualPrice,
            priceUpdatedAt: updatedAt,
            updatedAt,
          })
          .where(eq(cards.id, entry.cardId))
          .run();
        return {
          status: 'updated',
          entry: serializeWatchlistEntry(entry, {
            ...card,
            priceCents,
            isManualPrice: item.isManualPrice,
            priceUpdatedAt: updatedAt,
          }),
        };
      }

      database
        .update(watchlistEntries)
        .set({
          priceCents,
          isManualPrice: item.isManualPrice,
          priceUpdatedAt: updatedAt,
          updatedAt,
        })
        .where(eq(watchlistEntries.id, entry.id))
        .run();
      return {
        status: 'updated',
        entry: serializeWatchlistEntry(
          {
            ...entry,
            priceCents,
            isManualPrice: item.isManualPrice,
            priceUpdatedAt: updatedAt,
            updatedAt,
          },
          null,
        ),
      };
    });

    const responseStatus = outcomes.some((outcome) => outcome.status === 'failed') ? 207 : 200;
    response.status(responseStatus).json(outcomes);
  });

  return router;
}
