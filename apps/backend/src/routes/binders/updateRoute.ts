import {
  BINDER_NAME_MAX_LENGTH,
  BINDER_NOTES_MAX_LENGTH,
  BINDER_TAG_MAX_LENGTH,
  DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE,
  getMaxPhysicalPage,
  normalizeBinderTagsList,
} from '@binder-project-planner/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { Router } from 'express';

import type { DatabaseConnection } from '../../database/client.js';
import {
  art,
  binderCostEntries,
  binders,
  cards,
  holographicPaperCostEntries,
  printingCostEntries,
} from '../../database/schema.js';
import { lockedBinderConflictProblem } from '../../lockedBinderProblem.js';
import { listArtForBinder } from '../art/index.js';
import { listCardsForBinder } from '../cards/index.js';

import { findResizeAffectedPlacements, ResizeConflictError } from './resizeHelpers.js';
import {
  badRequestProblem,
  fromHundredths,
  notFoundProblem,
  serializeBinder,
  toHundredths,
} from './serialization.js';
import { findOverlongTag, listTagsForBinder, replaceBinderTags } from './tagsHelpers.js';
import type { BinderRow, BindersRouteDeps, UpdateBinderRequestBody } from './types.js';
import {
  HEX_COLOR_PATTERN,
  isUniqueConstraintError,
  validateDimensionFields,
} from './validation.js';

// Story 7's binder-update endpoint - by far the largest single route in
// this router, since it's the accumulation point for every story that
// added an editable binder field (24's dimensions/style, 20's preview page,
// 23's notes, 27's resize relocation, 32's locking, 34's cost-entry
// selections, 51's tags).
export function registerUpdateBinderRoute(router: Router, deps: BindersRouteDeps): void {
  const { database } = deps;

  router.patch('/binders/:binderId', (request, response) => {
    const { binderId } = request.params;
    const body = request.body as UpdateBinderRequestBody;

    const existing = database.select().from(binders).where(eq(binders.id, binderId)).get();
    if (!existing) {
      response.status(404).type('application/problem+json').json(notFoundProblem(binderId));
      return;
    }

    // Story 32: a currently locked binder only ever accepts an update
    // containing solely the `locked` field itself (so it can still be
    // unlocked through this same endpoint) - every other details/layout
    // field is rejected with a stable locked-binder `409 Conflict`
    // regardless of what this same request's `locked` value would set it
    // to next. Story 34 extends this carve-out to the 3 cost-entry
    // selection fields, which - like `locked` - are never restricted by
    // lock state.
    const UNRESTRICTED_FIELDS = new Set([
      'locked',
      'selectedBinderCostEntryId',
      'selectedPrintingCostEntryId',
      'selectedHolographicPaperCostEntryId',
    ]);
    const isRestrictedFieldsOnlyUpdate = Object.keys(body).every((key) =>
      UNRESTRICTED_FIELDS.has(key),
    );
    if (existing.locked && !isRestrictedFieldsOnlyUpdate) {
      response.status(409).type('application/problem+json').json(lockedBinderConflictProblem());
      return;
    }

    // Only `name` needs post-trim re-validation and re-normalization here;
    // width/height/pages are already fully validated by the OpenAPI schema.
    const updates: Partial<BinderRow> = {};
    if (body.locked !== undefined) updates.locked = body.locked;
    if (body.name !== undefined) {
      const trimmedName = body.name.trim();
      if (trimmedName.length === 0 || trimmedName.length > BINDER_NAME_MAX_LENGTH) {
        response
          .status(400)
          .type('application/problem+json')
          .json({
            type: 'about:blank',
            title: 'Bad Request',
            status: 400,
            detail: `Binder name must be between 1 and ${BINDER_NAME_MAX_LENGTH} characters after trimming.`,
          });
        return;
      }
      updates.name = trimmedName;
      updates.normalizedName = trimmedName.toLowerCase();
    }
    if (body.width !== undefined) updates.width = body.width;
    if (body.height !== undefined) updates.height = body.height;
    if (body.pages !== undefined) updates.pages = body.pages;

    // Story 23: notes. An exactly-empty string is normalized to null;
    // non-empty Markdown is stored as-is without trimming leading/trailing
    // whitespace. The OpenAPI schema already enforces the 1,000,000-char
    // maximum, but it's re-checked here as defense-in-depth (a null value
    // clears the notes and is always within bounds).
    if (body.notes !== undefined) {
      if (body.notes !== null && body.notes.length > BINDER_NOTES_MAX_LENGTH) {
        response
          .status(400)
          .type('application/problem+json')
          .json(
            badRequestProblem(
              `Binder notes must be ${BINDER_NOTES_MAX_LENGTH} characters or fewer.`,
            ),
          );
        return;
      }
      updates.notes = body.notes === '' ? null : body.notes;
    }

    // Story 51: a full replacement of this binder's tags, mirroring the
    // OpenAPI contract's "no separate add/remove endpoint" design (see
    // `BinderTags`). `undefined` means "leave the currently stored tags
    // untouched"; computed here (rather than inside `updates`, which only
    // holds `binders` table columns) since tags live in their own table.
    let normalizedTags: string[] | undefined;
    if (body.tags !== undefined) {
      normalizedTags = normalizeBinderTagsList(body.tags);
      const overlongTag = findOverlongTag(normalizedTags);
      if (overlongTag) {
        response
          .status(400)
          .type('application/problem+json')
          .json(
            badRequestProblem(
              `Tag "${overlongTag}" must be ${BINDER_TAG_MAX_LENGTH} characters or fewer.`,
            ),
          );
        return;
      }
    }

    // Cross-field dimension validation (story 24) runs against the
    // *effective* values - existing persisted values overridden by any
    // fields included in this patch - since e.g. changing only `widthBase`
    // must still be checked against the binder's current (or
    // simultaneously updated) `widthPerSlot`.
    const dimensionFieldsIncluded =
      body.widthPerSlot !== undefined ||
      body.widthBase !== undefined ||
      body.heightPerSlot !== undefined ||
      body.heightBase !== undefined;
    if (dimensionFieldsIncluded) {
      const effective = {
        widthPerSlot: body.widthPerSlot ?? fromHundredths(existing.widthPerSlotHundredths),
        widthBase: body.widthBase ?? fromHundredths(existing.widthBaseHundredths),
        heightPerSlot: body.heightPerSlot ?? fromHundredths(existing.heightPerSlotHundredths),
        heightBase: body.heightBase ?? fromHundredths(existing.heightBaseHundredths),
      };
      const dimensionError = validateDimensionFields(effective);
      if (dimensionError) {
        response
          .status(400)
          .type('application/problem+json')
          .json(badRequestProblem(dimensionError));
        return;
      }
    }
    if (body.widthPerSlot !== undefined) {
      updates.widthPerSlotHundredths = toHundredths(body.widthPerSlot);
    }
    if (body.widthBase !== undefined) {
      updates.widthBaseHundredths = toHundredths(body.widthBase);
    }
    if (body.heightPerSlot !== undefined) {
      updates.heightPerSlotHundredths = toHundredths(body.heightPerSlot);
    }
    if (body.heightBase !== undefined) {
      updates.heightBaseHundredths = toHundredths(body.heightBase);
    }
    if (body.borderColor !== undefined) {
      if (!HEX_COLOR_PATTERN.test(body.borderColor)) {
        response
          .status(400)
          .type('application/problem+json')
          .json(badRequestProblem('borderColor must be a six-digit #RRGGBB hexadecimal color.'));
        return;
      }
      updates.borderColor = body.borderColor.toUpperCase();
    }
    if (body.borderRadius !== undefined) {
      updates.borderRadiusHundredths = toHundredths(body.borderRadius);
    }
    if (body.borderWidth !== undefined) {
      updates.borderWidthHundredths = toHundredths(body.borderWidth);
    }

    // Story 20: previewPhysicalPage must be a valid physical page for the
    // *effective* stored page count (an included `pages` change, or the
    // existing value otherwise) - same "effective values" reasoning as the
    // dimension fields above.
    const effectivePages = body.pages ?? existing.pages;
    const maxPhysicalPage = getMaxPhysicalPage(effectivePages);
    if (body.previewPhysicalPage !== undefined) {
      if (body.previewPhysicalPage < 1 || body.previewPhysicalPage > maxPhysicalPage) {
        response
          .status(400)
          .type('application/problem+json')
          .json(badRequestProblem(`previewPhysicalPage must be between 1 and ${maxPhysicalPage}.`));
        return;
      }
      updates.previewPhysicalPage = body.previewPhysicalPage;
    } else if (existing.previewPhysicalPage > maxPhysicalPage) {
      // Reducing the stored page count made the saved preview page
      // invalid without the request explicitly supplying a replacement -
      // reset it to the shared default in this same update, per
      // planning.md's "If reducing stored page count makes the saved
      // preview page invalid, the frontend and backend reset
      // previewPhysicalPage to DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE".
      updates.previewPhysicalPage = DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE;
    }

    const effectiveDimensions = {
      width: body.width ?? existing.width,
      height: body.height ?? existing.height,
      pages: body.pages ?? existing.pages,
    };

    // Story 34: this binder's currently selected shared Binder cost entry.
    // A provided id must exist and its own stored width/height/pages must
    // match this update's *effective* dimensions (same "effective values"
    // reasoning used throughout this handler) - the frontend's dropdown
    // only ever lists already-matching entries, so this is defense-in-
    // depth against a stale or hand-crafted request.
    if (body.selectedBinderCostEntryId !== undefined) {
      if (body.selectedBinderCostEntryId !== null) {
        const entry = database
          .select()
          .from(binderCostEntries)
          .where(eq(binderCostEntries.id, body.selectedBinderCostEntryId))
          .get();
        if (!entry) {
          response
            .status(400)
            .type('application/problem+json')
            .json(
              badRequestProblem(
                `No binder cost entry exists with id "${body.selectedBinderCostEntryId}".`,
              ),
            );
          return;
        }
        if (
          entry.width !== effectiveDimensions.width ||
          entry.height !== effectiveDimensions.height ||
          entry.pages !== effectiveDimensions.pages
        ) {
          response
            .status(400)
            .type('application/problem+json')
            .json(
              badRequestProblem(
                "selectedBinderCostEntryId must match this binder's effective width, height, and pages.",
              ),
            );
          return;
        }
      }
      updates.selectedBinderCostEntryId = body.selectedBinderCostEntryId;
    } else if (
      existing.selectedBinderCostEntryId !== null &&
      (body.width !== undefined || body.height !== undefined || body.pages !== undefined)
    ) {
      // Story 34: "Changing the current binder's width, height, or page
      // count clears any Binder entry currently selected for that binder"
      // whenever it no longer matches - checked here, not just left to
      // the dropdown, since this update itself is what may invalidate it.
      const currentEntry = database
        .select()
        .from(binderCostEntries)
        .where(eq(binderCostEntries.id, existing.selectedBinderCostEntryId))
        .get();
      if (
        !currentEntry ||
        currentEntry.width !== effectiveDimensions.width ||
        currentEntry.height !== effectiveDimensions.height ||
        currentEntry.pages !== effectiveDimensions.pages
      ) {
        updates.selectedBinderCostEntryId = null;
      }
    }

    // Story 34: the Printing/Holographic Paper selections have no
    // dimension constraint - just id existence.
    if (body.selectedPrintingCostEntryId !== undefined) {
      if (body.selectedPrintingCostEntryId !== null) {
        const entry = database
          .select({ id: printingCostEntries.id })
          .from(printingCostEntries)
          .where(eq(printingCostEntries.id, body.selectedPrintingCostEntryId))
          .get();
        if (!entry) {
          response
            .status(400)
            .type('application/problem+json')
            .json(
              badRequestProblem(
                `No printing cost entry exists with id "${body.selectedPrintingCostEntryId}".`,
              ),
            );
          return;
        }
      }
      updates.selectedPrintingCostEntryId = body.selectedPrintingCostEntryId;
    }
    if (body.selectedHolographicPaperCostEntryId !== undefined) {
      if (body.selectedHolographicPaperCostEntryId !== null) {
        const entry = database
          .select({ id: holographicPaperCostEntries.id })
          .from(holographicPaperCostEntries)
          .where(eq(holographicPaperCostEntries.id, body.selectedHolographicPaperCostEntryId))
          .get();
        if (!entry) {
          response
            .status(400)
            .type('application/problem+json')
            .json(
              badRequestProblem(
                `No holographic paper cost entry exists with id "${body.selectedHolographicPaperCostEntryId}".`,
              ),
            );
          return;
        }
      }
      updates.selectedHolographicPaperCostEntryId = body.selectedHolographicPaperCostEntryId;
    }

    // Story 27: resize-preview and relocation handling apply only to
    // potentially reducing updates. Increasing dimensions/pages preserves
    // placements without any relocation path.
    const isReducingResize =
      effectiveDimensions.width < existing.width ||
      effectiveDimensions.height < existing.height ||
      effectiveDimensions.pages < existing.pages;

    const now = new Date().toISOString();
    updates.updatedAt = now;

    let updated: BinderRow;
    let movedCardIds: string[] = [];
    let movedArtIds: string[] = [];
    let affectedCardCount = 0;
    let affectedArtCount = 0;
    try {
      const transactionResult = database.transaction((tx) => {
        if (isReducingResize) {
          const affected = findResizeAffectedPlacements(
            tx as unknown as DatabaseConnection['database'],
            binderId,
            effectiveDimensions,
          );
          affectedCardCount = affected.affectedCardCount;
          affectedArtCount = affected.affectedArtCount;

          if (
            affectedCardCount + affectedArtCount > 0 &&
            body.moveAffectedItemsToUnplaced !== true
          ) {
            throw new ResizeConflictError(affectedCardCount, affectedArtCount);
          }

          movedCardIds = affected.affectedCardIds;
          movedArtIds = affected.affectedArtIds;

          if (movedCardIds.length > 0) {
            tx.update(cards)
              .set({ physicalPage: null, row: null, column: null, updatedAt: now })
              .where(and(eq(cards.binderId, binderId), inArray(cards.id, movedCardIds)))
              .run();
          }
          if (movedArtIds.length > 0) {
            tx.update(art)
              .set({ physicalPage: null, row: null, column: null, updatedAt: now })
              .where(and(eq(art.binderId, binderId), inArray(art.id, movedArtIds)))
              .run();
          }
        }

        const updatedRow = tx
          .update(binders)
          .set(updates)
          .where(eq(binders.id, binderId))
          .returning()
          .get() as BinderRow;

        // Story 51: a full replacement of this binder's tags, in the same
        // transaction as the rest of the update.
        if (normalizedTags !== undefined) {
          replaceBinderTags(
            tx as unknown as DatabaseConnection['database'],
            binderId,
            normalizedTags,
            now,
          );
        }

        return updatedRow;
      });

      updated = transactionResult;
    } catch (error) {
      if (error instanceof ResizeConflictError) {
        response.status(409).type('application/problem+json').json({
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          detail:
            'The proposed binder size or page-count reduction affects placed items. Confirm relocation to continue.',
          affectedCardCount: error.affectedCardCount,
          affectedArtCount: error.affectedArtCount,
        });
        return;
      }

      if (isUniqueConstraintError(error)) {
        response
          .status(409)
          .type('application/problem+json')
          .json({
            type: 'about:blank',
            title: 'Conflict',
            status: 409,
            detail: `A binder named "${body.name}" already exists.`,
            conflictingField: 'name',
          });
        return;
      }

      throw error;
    }

    // Story 27: a successful affecting resize returns complete binder
    // details plus complete representations of every moved card/art item,
    // so the client can reconcile layout state without a refetch.
    const movedCardIdSet = new Set(movedCardIds);
    const movedArtIdSet = new Set(movedArtIds);
    const movedCards =
      movedCardIdSet.size === 0
        ? []
        : listCardsForBinder(database, binderId).filter((cardItem) =>
            movedCardIdSet.has(cardItem.id),
          );
    const movedArt =
      movedArtIdSet.size === 0
        ? []
        : listArtForBinder(database, binderId).filter((artItem) => movedArtIdSet.has(artItem.id));

    response.status(200).json({
      binder: serializeBinder(updated, listTagsForBinder(database, binderId)),
      movedCards,
      movedArt,
      affectedCardCount,
      affectedArtCount,
    });
  });
}
