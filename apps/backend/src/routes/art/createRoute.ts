import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';

import { ART_DESCRIPTION_MAX_LENGTH, ART_TITLE_MAX_LENGTH } from '@binder-project-planner/shared';
import { eq } from 'drizzle-orm';
import type { Router } from 'express';

import { art, artImageAssets, binders } from '../../database/schema.js';
import { lockedBinderConflictProblem } from '../../lockedBinderProblem.js';

import {
  removeTemporaryUploads,
  resolveArtImageAsset,
  UnsupportedImageFormatError,
  type ResolvedArtImageAsset,
} from './imageAssets.js';
import { problem, serializeArt, toHundredths, toTenThousandths } from './serialization.js';
import type { ArtRouteDeps, ArtRow, CreateArtRequestBody } from './types.js';
import { HEX_COLOR_PATTERN } from './validation.js';

// Story 25's create-art endpoint. New art always starts unplaced (all-
// null placement) - placing art on the layout is story 26's scope.
export function registerCreateArtRoute(router: Router, deps: ArtRouteDeps): void {
  const { database, imagesDirectory } = deps;

  router.post('/binders/:binderId/art', async (request, response) => {
    const { binderId } = request.params;
    const uploadedFiles = Array.isArray(request.files) ? request.files : undefined;
    const body = request.body as CreateArtRequestBody;

    const binder = database.select().from(binders).where(eq(binders.id, binderId)).get();
    if (!binder) {
      if (uploadedFiles) removeTemporaryUploads(uploadedFiles);
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No binder exists with id "${binderId}".`));
      return;
    }

    // Story 32: a locked binder rejects every art mutation, including
    // creating one.
    if (binder.locked) {
      if (uploadedFiles) removeTemporaryUploads(uploadedFiles);
      response.status(409).type('application/problem+json').json(lockedBinderConflictProblem());
      return;
    }

    const uploadedFile = uploadedFiles?.find((file) => file.fieldname === 'image');
    if (!uploadedFile) {
      // Never expected: the OpenAPI schema requires `image`, so
      // express-openapi-validator already rejects a request missing it
      // before this handler runs. Guarded defensively regardless.
      if (uploadedFiles) removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'Multi-slot art requires an image file.'));
      return;
    }

    // Required after trimming (planning.md); the OpenAPI schema's
    // `minLength: 1` only guards the raw untrimmed value.
    const title = body.title.trim();
    if (!title) {
      removeTemporaryUploads(uploadedFiles!);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'title is required.'));
      return;
    }
    if (title.length > ART_TITLE_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles!);
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
      removeTemporaryUploads(uploadedFiles!);
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
      removeTemporaryUploads(uploadedFiles!);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', `widthSlots must be between 1 and ${binder.width}.`));
      return;
    }
    if (body.heightSlots < 1 || body.heightSlots > binder.height) {
      removeTemporaryUploads(uploadedFiles!);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', `heightSlots must be between 1 and ${binder.height}.`));
      return;
    }

    const imageRotationDegrees = body.imageRotationDegrees ?? 0;
    if (![0, 90, 180, 270].includes(imageRotationDegrees)) {
      removeTemporaryUploads(uploadedFiles!);
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
      removeTemporaryUploads(uploadedFiles!);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'focalX and focalY must each be between 0 and 1.'));
      return;
    }

    const scaleX = body.scaleX ?? 1;
    const scaleY = body.scaleY ?? 1;
    if (scaleX <= 0 || scaleY <= 0) {
      removeTemporaryUploads(uploadedFiles!);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'scaleX and scaleY must each be greater than zero.'));
      return;
    }

    // Nullable border overrides: an omitted or explicitly-null value keeps
    // "use the binder's current setting" (stored as `null`); a supplied
    // value is validated the same way routes/binders/validation.ts validates the
    // binder-level setting.
    const borderColor = body.borderColor ?? null;
    if (borderColor !== null && !HEX_COLOR_PATTERN.test(borderColor)) {
      removeTemporaryUploads(uploadedFiles!);
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
      removeTemporaryUploads(uploadedFiles!);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'borderRadius must be between 0 and 100.'));
      return;
    }
    const borderWidth = body.borderWidth ?? null;
    if (borderWidth !== null && borderWidth < 0) {
      removeTemporaryUploads(uploadedFiles!);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'borderWidth must be 0 or greater.'));
      return;
    }

    let asset: ResolvedArtImageAsset;
    try {
      asset = await resolveArtImageAsset(database, imagesDirectory, uploadedFile);
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

    const now = new Date().toISOString();
    const newArt: ArtRow = {
      id: randomUUID(),
      binderId,
      title,
      description,
      widthSlots: body.widthSlots,
      heightSlots: body.heightSlots,
      physicalPage: null,
      row: null,
      column: null,
      imageAssetId: asset.assetId,
      imageRotationDegrees,
      focalXTenThousandths: toTenThousandths(focalX),
      focalYTenThousandths: toTenThousandths(focalY),
      scaleXTenThousandths: toTenThousandths(scaleX),
      scaleYTenThousandths: toTenThousandths(scaleY),
      borderColor: borderColor ? borderColor.toUpperCase() : null,
      borderRadiusHundredths: borderRadius === null ? null : toHundredths(borderRadius),
      borderWidthHundredths: borderWidth === null ? null : toHundredths(borderWidth),
      createdAt: now,
      updatedAt: now,
    };

    try {
      database.insert(art).values(newArt).run();
    } catch (error) {
      // The image asset row/file(s) this request just created are
      // otherwise unreferenced once the art insert fails, so they're
      // removed rather than left orphaned (planning.md).
      if (asset.newlyCreatedPaths.length > 0) {
        for (const path of asset.newlyCreatedPaths) unlinkSync(path);
        database.delete(artImageAssets).where(eq(artImageAssets.id, asset.assetId)).run();
      }
      throw error;
    }

    response.status(201).location(`/art/${newArt.id}`).json(serializeArt(newArt));
  });
}
