import { apiClient, backendUrl } from './client';
import type { Art, PlacementCoordinates } from './types';

// Fetches every binder-owned multi-slot-art record through
// `GET /binders/{binderId}/art` (story 7, populated by story 25's art
// creation).
export async function listBinderArt(binderId: string, signal?: AbortSignal): Promise<Art[]> {
  const { data, error } = await apiClient.GET('/binders/{binderId}/art', {
    params: { path: { binderId } },
    signal,
  });

  if (error) {
    throw error;
  }

  return data;
}

// One multi-slot-art item's creation request (story 25) - built into a
// `multipart/form-data` body below since it carries the uploaded image
// file itself. Border overrides are `null` when the field stays in "use
// binder setting" mode; a non-null value is a custom per-art override.
export interface CreateArtRequest {
  title: string;
  description: string | null;
  widthSlots: number;
  heightSlots: number;
  imageRotationDegrees: 0 | 90 | 180 | 270;
  focalX: number;
  focalY: number;
  scaleX: number;
  scaleY: number;
  borderColor: string | null;
  borderRadius: number | null;
  borderWidth: number | null;
  image: File;
}

// Creates multi-slot art in the unplaced-art section through
// `POST /binders/{binderId}/art` (story 25). Throws the Problem Details
// body on failure so the caller can roll back its optimistic insert and
// surface the error via `toProblemDetailsInfo`.
export async function createArt(binderId: string, request: CreateArtRequest): Promise<Art> {
  const formData = new FormData();
  formData.append('title', request.title);
  if (request.description) formData.append('description', request.description);
  formData.append('widthSlots', String(request.widthSlots));
  formData.append('heightSlots', String(request.heightSlots));
  formData.append('imageRotationDegrees', String(request.imageRotationDegrees));
  formData.append('focalX', String(request.focalX));
  formData.append('focalY', String(request.focalY));
  formData.append('scaleX', String(request.scaleX));
  formData.append('scaleY', String(request.scaleY));
  if (request.borderColor) formData.append('borderColor', request.borderColor);
  if (request.borderRadius !== null) formData.append('borderRadius', String(request.borderRadius));
  if (request.borderWidth !== null) formData.append('borderWidth', String(request.borderWidth));
  formData.append('image', request.image);

  const { data, error } = await apiClient.POST('/binders/{binderId}/art', {
    params: { path: { binderId } },
    // See createCustomCard's identical comment: openapi-fetch passes a
    // `FormData` instance through untouched, but the generated request-body
    // type only models the multipart schema's field shapes.
    body: formData as never,
  });

  if (error) {
    throw error;
  }

  return data;
}

// Resolves an `Art.imageUrl` into a full URL for an `<img>` tag (story 25),
// mirroring `resolveCardImageUrl`.
export function resolveArtImageUrl(imageUrl: string): string {
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  return `${backendUrl}${imageUrl}`;
}

// Moves one art item to a new placement (or to the unplaced-art section)
// through `PATCH /art/{artId}` (story 26). Unlike `moveCards`, art never
// swaps - this always sends exactly one expected/final placement pair.
// Throws the Problem Details body on failure (e.g. `409 Conflict` for a
// stale expected position or an occupied destination) so the caller can
// roll back its optimistic move and surface the error via
// `toProblemDetailsInfo`.
export async function moveArt(
  artId: string,
  expectedPlacement: PlacementCoordinates,
  finalPlacement: PlacementCoordinates,
): Promise<Art> {
  const { data, error } = await apiClient.PATCH('/art/{artId}', {
    params: { path: { artId } },
    body: { expectedPlacement, finalPlacement },
  });

  if (error) {
    throw error;
  }

  return data;
}

// One art item's edit request (story 26) - built into a `multipart/
// form-data` body below, mirroring `CreateArtRequest`'s fields. `image` is
// optional: omitting it keeps the art's current image.
// `moveToUnplacedOnConflict` confirms saving edited dimensions that would
// leave currently-placed art out of bounds or overlapping another item by
// moving it to the unplaced-art section in the same request.
export interface UpdateArtRequest {
  title: string;
  description: string | null;
  widthSlots: number;
  heightSlots: number;
  imageRotationDegrees: 0 | 90 | 180 | 270;
  focalX: number;
  focalY: number;
  scaleX: number;
  scaleY: number;
  borderColor: string | null;
  borderRadius: number | null;
  borderWidth: number | null;
  moveToUnplacedOnConflict?: boolean;
  image?: File;
}

// Edits an existing art item's metadata, transform, style overrides, and
// (optionally) its image through `PATCH /art/{artId}` (story 26). Throws
// the Problem Details body on failure - including `409 Conflict` when
// edited dimensions would leave placed art out of bounds/overlapping and
// `moveToUnplacedOnConflict` wasn't set - so the caller can roll back its
// optimistic edit and surface the error, or offer the nested "Save and
// Move to Unplaced" confirmation.
export async function updateArt(artId: string, request: UpdateArtRequest): Promise<Art> {
  const formData = new FormData();
  formData.append('title', request.title);
  if (request.description) formData.append('description', request.description);
  formData.append('widthSlots', String(request.widthSlots));
  formData.append('heightSlots', String(request.heightSlots));
  formData.append('imageRotationDegrees', String(request.imageRotationDegrees));
  formData.append('focalX', String(request.focalX));
  formData.append('focalY', String(request.focalY));
  formData.append('scaleX', String(request.scaleX));
  formData.append('scaleY', String(request.scaleY));
  if (request.borderColor) formData.append('borderColor', request.borderColor);
  if (request.borderRadius !== null) formData.append('borderRadius', String(request.borderRadius));
  if (request.borderWidth !== null) formData.append('borderWidth', String(request.borderWidth));
  if (request.moveToUnplacedOnConflict) formData.append('moveToUnplacedOnConflict', 'true');
  if (request.image) formData.append('image', request.image);

  const { data, error } = await apiClient.PATCH('/art/{artId}', {
    params: { path: { artId } },
    // See createCustomCard's identical comment: openapi-fetch passes a
    // `FormData` instance through untouched, but the generated request-body
    // type only models the multipart schema's field shapes.
    body: formData as never,
  });

  if (error) {
    throw error;
  }

  return data;
}

// Permanently deletes a binder-owned art item through `DELETE
// /art/{artId}` (story 26). Deleting an already-absent art item also
// succeeds (`204 No Content`), matching the backend's idempotent-delete
// contract; throws the Problem Details body on any other failure so the
// caller can roll back its optimistic removal and surface the error via
// `toProblemDetailsInfo`.
export async function deleteArt(artId: string): Promise<void> {
  const { error } = await apiClient.DELETE('/art/{artId}', {
    params: { path: { artId } },
  });

  if (error) {
    throw error;
  }
}

// Duplicates an art item into the unplaced-art section through `POST
// /art/{artId}/duplicate` (story 26). `idempotencyKey` is a
// client-generated UUID sent as the `Idempotency-Key` header; retrying the
// same key after a dropped response replays the original outcome instead
// of creating a second copy, matching the backend's 24-hour
// mutation-idempotency retention. Throws the Problem Details body on
// failure so the caller can roll back its optimistic insert.
export async function duplicateArt(artId: string, idempotencyKey: string): Promise<Art> {
  const { data, error } = await apiClient.POST('/art/{artId}/duplicate', {
    params: { path: { artId }, header: { 'Idempotency-Key': idempotencyKey } },
  });

  if (error) {
    throw error;
  }

  return data;
}
