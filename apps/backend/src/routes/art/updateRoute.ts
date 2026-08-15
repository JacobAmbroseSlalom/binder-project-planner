import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { ART_DESCRIPTION_MAX_LENGTH, ART_TITLE_MAX_LENGTH } from '@binder-project-planner/shared';
import { eq } from 'drizzle-orm';
import type { Router } from 'express';

import type { DatabaseConnection } from '../../database/client.js';
import { art, artImageAssets, binders } from '../../database/schema.js';
import { lockedBinderConflictProblem } from '../../lockedBinderProblem.js';
import { getArtFootprintCells, getOccupiedCells } from '../../placement/occupancy.js';

import {
  removeTemporaryUploads,
  resolveArtImageAsset,
  UnsupportedImageFormatError,
  type ResolvedArtImageAsset,
} from './imageAssets.js';
import { problem, serializeArt, toHundredths, toTenThousandths } from './serialization.js';
import type { ArtRouteDeps, ArtRow, MoveArtRequestBody, UpdateArtRequestBody } from './types.js';
import { HEX_COLOR_PATTERN, validateArtPlacement } from './validation.js';

// Thrown from inside the move transaction below (story 26) when an
// update's expected placement no longer matches the art's persisted
// placement, or the destination footprint is occupied; the route handler
// maps this to a `409 Conflict` Problem Details response and the
// transaction rolls back automatically.
class ArtMoveConflictError extends Error {}

// Story 26's combined move/edit endpoint: `application/json` requests
// move placed or unplaced art to a new placement (or to the unplaced
// section); `multipart/form-data` requests edit the art's own metadata,
// transform, style overrides, and (optionally) its image - branching the
// same way `POST /binders/:binderId/cards` already does, on whether
// express-openapi-validator's multer integration populated
// `request.files` (see app.ts's `fileUploader` comment).
export function registerUpdateArtRoute(router: Router, deps: ArtRouteDeps): void {
  const { database, imagesDirectory } = deps;

  router.patch('/art/:artId', async (request, response) => {
    const { artId } = request.params;
    const uploadedFiles = Array.isArray(request.files) ? request.files : undefined;

    const existing = database.select().from(art).where(eq(art.id, artId)).get() as
      ArtRow | undefined;
    if (!existing) {
      if (uploadedFiles) removeTemporaryUploads(uploadedFiles);
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No art exists with id "${artId}".`));
      return;
    }

    const binder = database.select().from(binders).where(eq(binders.id, existing.binderId)).get();
    // Unreachable in practice - `art.binderId` has a `NOT NULL ...
    // REFERENCES binders(id)` foreign key - but guarded defensively rather
    // than asserting `binder!` below.
    if (!binder) {
      if (uploadedFiles) removeTemporaryUploads(uploadedFiles);
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', 'No binder exists for this art item.'));
      return;
    }

    // Story 32: moving/editing art is a restricted mutation too.
    if (binder.locked) {
      if (uploadedFiles) removeTemporaryUploads(uploadedFiles);
      response.status(409).type('application/problem+json').json(lockedBinderConflictProblem());
      return;
    }

    if (!uploadedFiles) {
      // The movement branch. `expectedPlacement` guards against a stale
      // client silently clobbering a position another request already
      // moved this art to - same "compare before writing" pattern as
      // routes/cards/movementRoute.ts's own move endpoint.
      const body = request.body as MoveArtRequestBody;

      if (
        existing.physicalPage !== body.expectedPlacement.physicalPage ||
        existing.row !== body.expectedPlacement.row ||
        existing.column !== body.expectedPlacement.column
      ) {
        response
          .status(409)
          .type('application/problem+json')
          .json(problem(409, 'Conflict', 'The art no longer has its expected position.'));
        return;
      }

      const placementError = validateArtPlacement(
        body.finalPlacement,
        existing.widthSlots,
        existing.heightSlots,
        binder,
      );
      if (placementError) {
        response
          .status(400)
          .type('application/problem+json')
          .json(problem(400, 'Bad Request', placementError));
        return;
      }

      try {
        const updated = database.transaction((tx) => {
          if (body.finalPlacement.physicalPage !== null) {
            const footprint = getArtFootprintCells(
              { row: body.finalPlacement.row!, column: body.finalPlacement.column! },
              existing.widthSlots,
              existing.heightSlots,
            );
            const occupied = getOccupiedCells(
              tx as unknown as DatabaseConnection['database'],
              existing.binderId,
              body.finalPlacement.physicalPage,
              { excludeArtId: artId },
            );
            const blocked = footprint.some((cell) =>
              occupied.some(
                (occupant) => occupant.row === cell.row && occupant.column === cell.column,
              ),
            );
            if (blocked) {
              throw new ArtMoveConflictError(
                'One or more slots in the destination are already occupied.',
              );
            }
          }

          tx.update(art)
            .set({
              physicalPage: body.finalPlacement.physicalPage,
              row: body.finalPlacement.row,
              column: body.finalPlacement.column,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(art.id, artId))
            .run();

          return tx.select().from(art).where(eq(art.id, artId)).get()! as ArtRow;
        });

        response.status(200).json(serializeArt(updated));
      } catch (error) {
        if (error instanceof ArtMoveConflictError) {
          response
            .status(409)
            .type('application/problem+json')
            .json(problem(409, 'Conflict', error.message));
          return;
        }
        throw error;
      }
      return;
    }

    // The edit branch. Mirrors the create endpoint's own metadata
    // validation exactly (see `POST /binders/:binderId/art`), plus the
    // optional image replacement and the move-to-unplaced-on-conflict
    // flag story 26 adds.
    const body = request.body as UpdateArtRequestBody;

    const title = body.title.trim();
    if (!title) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'title is required.'));
      return;
    }
    if (title.length > ART_TITLE_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(400, 'Bad Request', `title must be ${ART_TITLE_MAX_LENGTH} characters or fewer.`),
        );
      return;
    }

    const description = body.description?.trim() || null;
    if (description && description.length > ART_DESCRIPTION_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `description must be ${ART_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
          ),
        );
      return;
    }

    if (body.widthSlots < 1 || body.widthSlots > binder.width) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', `widthSlots must be between 1 and ${binder.width}.`));
      return;
    }
    if (body.heightSlots < 1 || body.heightSlots > binder.height) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', `heightSlots must be between 1 and ${binder.height}.`));
      return;
    }

    const imageRotationDegrees = body.imageRotationDegrees ?? 0;
    if (![0, 90, 180, 270].includes(imageRotationDegrees)) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(400, 'Bad Request', 'imageRotationDegrees must be one of 0, 90, 180, or 270.'),
        );
      return;
    }

    const focalX = body.focalX ?? 0.5;
    const focalY = body.focalY ?? 0.5;
    if (focalX < 0 || focalX > 1 || focalY < 0 || focalY > 1) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'focalX and focalY must each be between 0 and 1.'));
      return;
    }

    const scaleX = body.scaleX ?? 1;
    const scaleY = body.scaleY ?? 1;
    if (scaleX <= 0 || scaleY <= 0) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'scaleX and scaleY must each be greater than zero.'));
      return;
    }

    const borderColor = body.borderColor ?? null;
    if (borderColor !== null && !HEX_COLOR_PATTERN.test(borderColor)) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(400, 'Bad Request', 'borderColor must be a six-digit #RRGGBB hexadecimal color.'),
        );
      return;
    }
    const borderRadius = body.borderRadius ?? null;
    if (borderRadius !== null && (borderRadius < 0 || borderRadius > 100)) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'borderRadius must be between 0 and 100.'));
      return;
    }
    const borderWidth = body.borderWidth ?? null;
    if (borderWidth !== null && borderWidth < 0) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'borderWidth must be 0 or greater.'));
      return;
    }

    let newAsset: ResolvedArtImageAsset | null = null;
    const uploadedImageFile = uploadedFiles.find((file) => file.fieldname === 'image');
    if (uploadedImageFile) {
      try {
        newAsset = await resolveArtImageAsset(database, imagesDirectory, uploadedImageFile);
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

    // If this art is currently placed, re-validate its (unchanged) anchor
    // against the possibly-changed widthSlots/heightSlots - an edit that
    // grows the footprint can push it out of bounds or into another
    // item's space even though the anchor itself didn't move.
    let placementConflict = false;
    if (existing.physicalPage !== null) {
      const placementError = validateArtPlacement(
        { physicalPage: existing.physicalPage, row: existing.row, column: existing.column },
        body.widthSlots,
        body.heightSlots,
        binder,
      );
      if (placementError) {
        placementConflict = true;
      } else {
        const footprint = getArtFootprintCells(
          { row: existing.row!, column: existing.column! },
          body.widthSlots,
          body.heightSlots,
        );
        const occupied = getOccupiedCells(database, existing.binderId, existing.physicalPage, {
          excludeArtId: artId,
        });
        placementConflict = footprint.some((cell) =>
          occupied.some((occupant) => occupant.row === cell.row && occupant.column === cell.column),
        );
      }
    }

    if (placementConflict && !body.moveToUnplacedOnConflict) {
      // The newly-uploaded image (if any) is otherwise unreferenced once
      // this request is rejected, so it's removed rather than left
      // orphaned (planning.md).
      if (newAsset && newAsset.newlyCreatedPaths.length > 0) {
        for (const path of newAsset.newlyCreatedPaths) unlinkSync(path);
        database.delete(artImageAssets).where(eq(artImageAssets.id, newAsset.assetId)).run();
      }
      response
        .status(409)
        .type('application/problem+json')
        .json(
          problem(
            409,
            'Conflict',
            'Saving these changes would leave the art out of bounds or overlapping another item.',
          ),
        );
      return;
    }

    const now = new Date().toISOString();
    const updated = database.transaction((tx) => {
      tx.update(art)
        .set({
          title,
          description,
          widthSlots: body.widthSlots,
          heightSlots: body.heightSlots,
          imageRotationDegrees,
          focalXTenThousandths: toTenThousandths(focalX),
          focalYTenThousandths: toTenThousandths(focalY),
          scaleXTenThousandths: toTenThousandths(scaleX),
          scaleYTenThousandths: toTenThousandths(scaleY),
          borderColor: borderColor ? borderColor.toUpperCase() : null,
          borderRadiusHundredths: borderRadius === null ? null : toHundredths(borderRadius),
          borderWidthHundredths: borderWidth === null ? null : toHundredths(borderWidth),
          imageAssetId: newAsset ? newAsset.assetId : existing.imageAssetId,
          ...(placementConflict ? { physicalPage: null, row: null, column: null } : {}),
          updatedAt: now,
        })
        .where(eq(art.id, artId))
        .run();
      return tx.select().from(art).where(eq(art.id, artId)).get()! as ArtRow;
    });

    // The old image asset is otherwise unreferenced once no other art item
    // still points at it - cleaned up post-commit the same way art/card
    // deletion does, so a replaced image never leaves an orphaned file.
    if (newAsset && newAsset.assetId !== existing.imageAssetId) {
      const stillReferenced = database
        .select({ id: art.id })
        .from(art)
        .where(eq(art.imageAssetId, existing.imageAssetId))
        .get();
      if (!stillReferenced) {
        const oldAsset = database
          .select()
          .from(artImageAssets)
          .where(eq(artImageAssets.id, existing.imageAssetId))
          .get();
        database.delete(artImageAssets).where(eq(artImageAssets.id, existing.imageAssetId)).run();
        if (oldAsset) {
          for (const filename of [oldAsset.storageFilename, oldAsset.normalizedStorageFilename]) {
            if (!filename) continue;
            const filePath = join(imagesDirectory, filename);
            if (existsSync(filePath)) {
              try {
                unlinkSync(filePath);
              } catch (error) {
                request.log.error(
                  { err: error, path: filePath },
                  'Failed to delete an orphaned art image file after an art edit replaced its image.',
                );
              }
            }
          }
        }
      }
    }

    response.status(200).json(serializeArt(updated));
  });
}
