import { randomUUID } from 'node:crypto';

import {
  BINDER_NAME_MAX_LENGTH,
  BINDER_TAG_MAX_LENGTH,
  DEFAULT_BINDER_LOCKED,
  DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_RADIUS_PERCENT,
  DEFAULT_BORDER_WIDTH_CM,
  DEFAULT_HEIGHT_BASE_CM,
  DEFAULT_HEIGHT_PER_SLOT_CM,
  DEFAULT_WIDTH_BASE_CM,
  DEFAULT_WIDTH_PER_SLOT_CM,
  getMaxPhysicalPage,
  normalizeBinderTagsList,
} from '@binder-project-planner/shared';
import type { Router } from 'express';

import type { DatabaseConnection } from '../../database/client.js';
import { binders } from '../../database/schema.js';

import { badRequestProblem, serializeBinder, toHundredths } from './serialization.js';
import { findOverlongTag, replaceBinderTags } from './tagsHelpers.js';
import type { BindersRouteDeps, CreateBinderRequestBody } from './types.js';
import {
  HEX_COLOR_PATTERN,
  isUniqueConstraintError,
  validateDimensionFields,
} from './validation.js';

// Story 4's binder-creation endpoint (story 24 adds the dimension/style
// fields, story 51 adds tags).
export function registerCreateBinderRoute(router: Router, deps: BindersRouteDeps): void {
  const { database } = deps;

  router.post('/binders', (request, response) => {
    const body = request.body as CreateBinderRequestBody;
    const trimmedName = body.name.trim();

    // The OpenAPI schema validates the raw (untrimmed) name's length, but
    // trimming can change whether it's actually within bounds, so the
    // trimmed value is re-checked here per planning.md's requirement that
    // the 100-character limit and "required" rule apply after trimming.
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

    // Story 24's dimension/style fields are optional on create; an omitted
    // field falls back to its canonical shared default (per planning.md's
    // "Width per slot defaults to 6.85 cm" and similar defaults). The
    // reusable frontend form always sends all of them, so this fallback
    // only matters for a request that bypasses the form.
    const dimensionFields = {
      widthPerSlot: body.widthPerSlot ?? DEFAULT_WIDTH_PER_SLOT_CM,
      widthBase: body.widthBase ?? DEFAULT_WIDTH_BASE_CM,
      heightPerSlot: body.heightPerSlot ?? DEFAULT_HEIGHT_PER_SLOT_CM,
      heightBase: body.heightBase ?? DEFAULT_HEIGHT_BASE_CM,
    };
    const borderColor = body.borderColor ?? DEFAULT_BORDER_COLOR;
    const borderRadius = body.borderRadius ?? DEFAULT_BORDER_RADIUS_PERCENT;
    const borderWidth = body.borderWidth ?? DEFAULT_BORDER_WIDTH_CM;

    const dimensionError = validateDimensionFields(dimensionFields);
    if (dimensionError) {
      response.status(400).type('application/problem+json').json(badRequestProblem(dimensionError));
      return;
    }

    if (!HEX_COLOR_PATTERN.test(borderColor)) {
      response
        .status(400)
        .type('application/problem+json')
        .json(badRequestProblem('borderColor must be a six-digit #RRGGBB hexadecimal color.'));
      return;
    }

    // Story 20: an omitted previewPhysicalPage falls back to the shared
    // default (page 2); a supplied value must be a valid physical page for
    // this binder's own stored page count.
    const previewPhysicalPage = body.previewPhysicalPage ?? DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE;
    const maxPhysicalPage = getMaxPhysicalPage(body.pages);
    if (previewPhysicalPage < 1 || previewPhysicalPage > maxPhysicalPage) {
      response
        .status(400)
        .type('application/problem+json')
        .json(badRequestProblem(`previewPhysicalPage must be between 1 and ${maxPhysicalPage}.`));
      return;
    }

    // Story 51: an omitted tags array defaults to none; a supplied array is
    // trimmed and case-insensitively deduplicated (belt-and-suspenders
    // alongside the frontend's own combobox normalization), then checked
    // against the shared 30-character maximum.
    const tags = normalizeBinderTagsList(body.tags ?? []);
    const overlongTag = findOverlongTag(tags);
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

    const now = new Date().toISOString();
    const binder = {
      id: randomUUID(),
      name: trimmedName,
      normalizedName: trimmedName.toLowerCase(),
      width: body.width,
      height: body.height,
      pages: body.pages,
      widthPerSlotHundredths: toHundredths(dimensionFields.widthPerSlot),
      widthBaseHundredths: toHundredths(dimensionFields.widthBase),
      heightPerSlotHundredths: toHundredths(dimensionFields.heightPerSlot),
      heightBaseHundredths: toHundredths(dimensionFields.heightBase),
      // Normalizes hexadecimal letters to uppercase before saving, per
      // planning.md.
      borderColor: borderColor.toUpperCase(),
      borderRadiusHundredths: toHundredths(borderRadius),
      borderWidthHundredths: toHundredths(borderWidth),
      previewPhysicalPage,
      // Story 23: notes aren't part of binder creation (they're edited on
      // the Edit Layout tab), so a new binder always starts with none.
      notes: null,
      // Story 32: binder creation never exposes or accepts a
      // client-selected initial lock state - every new binder starts
      // unlocked.
      locked: DEFAULT_BINDER_LOCKED,
      // Story 34: a new binder never starts with any cost entry selected,
      // and its art-print page-count cache starts empty (never yet
      // computed).
      selectedBinderCostEntryId: null,
      selectedPrintingCostEntryId: null,
      selectedHolographicPaperCostEntryId: null,
      cachedArtPrintPageCount: null,
      cachedArtPrintPlacedArtCount: null,
      cachedArtPrintMaxArtUpdatedAt: null,
      cachedArtPrintBinderUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      // Story 51: the binder row and its initial tags are inserted
      // together so a failure partway through (e.g. the name-uniqueness
      // conflict below) never leaves orphaned tag rows.
      database.transaction((tx) => {
        tx.insert(binders).values(binder).run();
        replaceBinderTags(tx as unknown as DatabaseConnection['database'], binder.id, tags, now);
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        response
          .status(409)
          .type('application/problem+json')
          .json({
            type: 'about:blank',
            title: 'Conflict',
            status: 409,
            detail: `A binder named "${trimmedName}" already exists.`,
            conflictingField: 'name',
          });
        return;
      }

      throw error;
    }

    // Only the documented Binder fields are returned; `normalizedName` is an
    // internal uniqueness-enforcement detail and is never exposed to clients.
    response.status(201).location(`/binders/${binder.id}`).json(serializeBinder(binder, tags));
  });
}
