'use client';

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

import {
  createArt as createArtRequest,
  deleteArt as deleteArtRequest,
  duplicateArt as duplicateArtRequest,
  moveArt as moveArtRequest,
  updateArt as updateArtRequest,
  type Art,
  type Card,
  type PlacementCoordinates,
} from '@/lib/api';
import { useSaveStatusToast } from '@/shared/feedback';

import { getFootprintCells, isFootprintBlocked } from '../artFootprint';
import { isLockedBinderConflict } from './lockedBinderConflict';
import type { LayoutMovementHistoryAction } from './useLayoutMovement';

// The create-art modal's non-image field values (story 25) - excludes the
// image file (handled separately as a `File`).
export interface ArtFormValues {
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
}

// A one-shot signal set by `createArt` when a create-art submission fails
// (story 25: "reopens the editor with the image, metadata, dimensions,
// rotation, transforms, and style choices preserved"). `previewUrl` is the
// same object URL the failed optimistic item used - retained (not
// revoked) so the reopened editor can reuse it without recreating one -
// until `clearArtCreateRestore` revokes it once the editor no longer needs
// it.
export interface ArtCreateRestore {
  values: ArtFormValues;
  file: File;
  previewUrl: string;
}

// A one-shot signal set by `editArt` when an edit submission fails (story
// 26, mirroring `ArtCreateRestore`'s "reopen pre-filled" behavior). `file`/
// `previewUrl` are `null` when the failed edit didn't replace the image -
// the edit modal then keeps showing the art's existing (unchanged) image.
export interface ArtEditRestore {
  artId: string;
  values: ArtFormValues;
  file: File | null;
  previewUrl: string | null;
}

// Owns every art-scoped mutation (stories 25/26: create, move, edit,
// remove, duplicate) and their pending-request/restore state, operating
// on the `art` collection owned by `BinderRouteContext` and passed in here
// (rather than owned by this hook) so `useLayoutMovement`'s undo/redo
// executor can also reach it directly without this hook and
// `useLayoutMovement` needing to depend on each other's setters. `moveArt`
// shares its "movement in flight" flag and undo/redo history recording
// with `useCardMutations`'s `moveCard` (per story 14/28's single
// binder-scoped movement queue), so both are passed in from the shared
// `useLayoutMovement` hook rather than owned here; it also needs the
// current `cards` collection (read-only) to check whether a drop
// destination's footprint is already blocked.
export function useArtMutations({
  binderId,
  cards,
  art,
  setArt,
  isMovePending,
  setIsMovePending,
  recordSuccessfulMovement,
  pruneHistoryEntriesForItem,
  retry,
}: {
  binderId: string;
  cards: Card[];
  art: Art[];
  setArt: Dispatch<SetStateAction<Art[]>>;
  isMovePending: boolean;
  setIsMovePending: Dispatch<SetStateAction<boolean>>;
  recordSuccessfulMovement: (action: LayoutMovementHistoryAction) => void;
  pruneHistoryEntriesForItem: (itemId: string) => void;
  retry: () => void;
}) {
  const { start } = useSaveStatusToast();

  // Story 25's in-flight-art-create ids, mirroring
  // `pendingUnplacedCardIds`.
  const [pendingUnplacedArtIds, setPendingUnplacedArtIds] = useState<Set<string>>(new Set());
  // Story 25's one-shot create-art failure restore signal (see the context
  // value type's own doc comment above) - `null` whenever there's no
  // failed art submission awaiting correction.
  const [artCreateRestore, setArtCreateRestore] = useState<ArtCreateRestore | null>(null);
  // Story 26's in-flight-art-edit/deletion/duplication ids, mirroring
  // `pendingCardDeletionIds`/`pendingUnplacedArtIds`.
  const [pendingArtEditIds, setPendingArtEditIds] = useState<Set<string>>(new Set());
  const [pendingArtDeletionIds, setPendingArtDeletionIds] = useState<Set<string>>(new Set());
  const [pendingArtDuplicateIds, setPendingArtDuplicateIds] = useState<Set<string>>(new Set());
  // Story 26's one-shot edit-art failure restore signal, mirroring
  // `artCreateRestore` - `null` whenever there's no failed art edit
  // awaiting correction.
  const [artEditRestore, setArtEditRestore] = useState<ArtEditRestore | null>(null);

  // Creates multi-slot art directly into the unplaced-art section (story
  // 25), mirroring `assignCustomCard`'s optimistic-insert/replace-or-remove
  // lifecycle. New art always starts unplaced (all-null placement) -
  // placing it on the layout is story 26's scope.
  const createArt = useCallback(
    (values: ArtFormValues, file: File) => {
      const optimisticId = `optimistic-${crypto.randomUUID()}`;
      const previewUrl = URL.createObjectURL(file);
      const now = new Date().toISOString();
      const optimisticArt: Art = {
        id: optimisticId,
        binderId,
        title: values.title,
        description: values.description,
        widthSlots: values.widthSlots,
        heightSlots: values.heightSlots,
        placement: { physicalPage: null, row: null, column: null },
        imageUrl: previewUrl,
        imageRotationDegrees: values.imageRotationDegrees,
        focalX: values.focalX,
        focalY: values.focalY,
        scaleX: values.scaleX,
        scaleY: values.scaleY,
        borderColor: values.borderColor,
        borderRadius: values.borderRadius,
        borderWidth: values.borderWidth,
        createdAt: now,
        updatedAt: now,
      };

      setArt((previous) => [...previous, optimisticArt]);
      setPendingUnplacedArtIds((previous) => new Set(previous).add(optimisticId));

      const toast = start(`create-art-${optimisticId}`);

      createArtRequest(binderId, { ...values, image: file })
        .then((created) => {
          setArt((previous) => previous.map((item) => (item.id === optimisticId ? created : item)));
          toast.markSaved();
          // The backend's own `/art/{artId}/image` endpoint replaces this
          // optimistic entry, so the object-URL preview is no longer
          // referenced by anything.
          URL.revokeObjectURL(previewUrl);
        })
        .catch((error) => {
          setArt((previous) => previous.filter((item) => item.id !== optimisticId));
          // Retains `previewUrl` (rather than revoking it here) so the
          // reopened editor can reuse it without recreating one; it's
          // revoked once `clearArtCreateRestore` runs (planning.md).
          setArtCreateRestore({ values, file, previewUrl });
          toast.markFailed(error);
          // Story 32: reload the complete binder graph when this art
          // creation was rejected because the binder is now locked.
          if (isLockedBinderConflict(error)) retry();
        })
        .finally(() => {
          setPendingUnplacedArtIds((previous) => {
            const next = new Set(previous);
            next.delete(optimisticId);
            return next;
          });
        });
    },
    [binderId, setArt, start, retry],
  );

  // Clears the one-shot art-create restore signal once the create-art
  // modal has consumed it, revoking its retained object URL now that the
  // restored preview no longer needs it.
  const clearArtCreateRestore = useCallback(() => {
    setArtCreateRestore((previous) => {
      if (previous) URL.revokeObjectURL(previous.previewUrl);
      return null;
    });
  }, []);

  // Moves multi-slot art to a new placement, or to the unplaced-art
  // section (story 26). Cancels silently before any state change if the
  // destination footprint is already known - from the current `art`/
  // `cards` state - to be occupied, matching planning.md's "Dropping on a
  // client-known blocked footprint cancels locally ... sends no request or
  // toast" (the backend's own occupancy check still guards against a
  // destination that changed since this client last loaded it).
  const moveArt = useCallback(
    (artId: string, destination: PlacementCoordinates) => {
      if (isMovePending) return;

      const draggedArt = art.find((item) => item.id === artId);
      if (!draggedArt) return;

      if (
        destination.physicalPage !== null &&
        destination.row !== null &&
        destination.column !== null
      ) {
        const footprintCells = getFootprintCells(
          destination.row,
          destination.column,
          draggedArt.widthSlots,
          draggedArt.heightSlots,
        );
        if (isFootprintBlocked(cards, art, destination.physicalPage, footprintCells, artId)) return;
      }

      const previousPlacement = draggedArt.placement;
      setArt((previous) =>
        previous.map((item) => (item.id === artId ? { ...item, placement: destination } : item)),
      );
      setIsMovePending(true);

      const toast = start(`move-art-${artId}`);

      moveArtRequest(artId, previousPlacement, destination)
        .then((updated) => {
          setArt((previous) => previous.map((item) => (item.id === artId ? updated : item)));
          recordSuccessfulMovement({
            id: crypto.randomUUID(),
            kind: 'art',
            focalArtId: artId,
            artId,
            from: previousPlacement,
            to: destination,
          });
          toast.markSaved();
        })
        .catch((error) => {
          setArt((previous) =>
            previous.map((item) =>
              item.id === artId ? { ...item, placement: previousPlacement } : item,
            ),
          );
          toast.markFailed(error);
          // Story 32: reload the complete binder graph when this move was
          // rejected because the binder is now locked.
          if (isLockedBinderConflict(error)) retry();
        })
        .finally(() => {
          setIsMovePending(false);
        });
    },
    [art, cards, setArt, isMovePending, recordSuccessfulMovement, setIsMovePending, start, retry],
  );

  // Edits an existing art item's metadata, transform, style overrides, and
  // (optionally) its image (story 26), mirroring `assignCustomCard`'s
  // optimistic-apply/restore-on-failure lifecycle. `file` is `null` when
  // the edit keeps the art's current image.
  const editArt = useCallback(
    (
      artId: string,
      values: ArtFormValues,
      file: File | null,
      moveToUnplacedOnConflict?: boolean,
    ) => {
      const existing = art.find((item) => item.id === artId);
      if (!existing) return;

      const previousArt = existing;
      const previewUrl = file ? URL.createObjectURL(file) : null;

      setArt((previous) =>
        previous.map((item) =>
          item.id === artId
            ? {
                ...item,
                title: values.title,
                description: values.description,
                widthSlots: values.widthSlots,
                heightSlots: values.heightSlots,
                imageRotationDegrees: values.imageRotationDegrees,
                focalX: values.focalX,
                focalY: values.focalY,
                scaleX: values.scaleX,
                scaleY: values.scaleY,
                borderColor: values.borderColor,
                borderRadius: values.borderRadius,
                borderWidth: values.borderWidth,
                imageUrl: previewUrl ?? item.imageUrl,
              }
            : item,
        ),
      );
      setPendingArtEditIds((previous) => new Set(previous).add(artId));

      const toast = start(`edit-art-${artId}`);

      updateArtRequest(artId, {
        ...values,
        moveToUnplacedOnConflict,
        ...(file ? { image: file } : {}),
      })
        .then((updated) => {
          setArt((previous) => previous.map((item) => (item.id === artId ? updated : item)));
          pruneHistoryEntriesForItem(artId);
          toast.markSaved();
          if (previewUrl) URL.revokeObjectURL(previewUrl);
        })
        .catch((error) => {
          setArt((previous) => previous.map((item) => (item.id === artId ? previousArt : item)));
          // Retains `previewUrl` (rather than revoking it here) so the
          // reopened edit modal can reuse it, mirroring
          // `ArtCreateRestore`'s own comment above - revoked once
          // `clearArtEditRestore` runs.
          setArtEditRestore({ artId, values, file, previewUrl });
          toast.markFailed(error);
          // Story 32: reload the complete binder graph when this edit was
          // rejected because the binder is now locked.
          if (isLockedBinderConflict(error)) retry();
        })
        .finally(() => {
          setPendingArtEditIds((previous) => {
            const next = new Set(previous);
            next.delete(artId);
            return next;
          });
        });
    },
    [art, setArt, pruneHistoryEntriesForItem, start, retry],
  );

  // Clears the one-shot edit-art restore signal once the edit modal has
  // consumed it, revoking its retained object URL (if any) now that the
  // restored preview no longer needs it.
  const clearArtEditRestore = useCallback(() => {
    setArtEditRestore((previous) => {
      if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
      return null;
    });
  }, []);

  // Permanently removes an art item from the binder (story 26), mirroring
  // `removeCard`'s exact-list-index restore-on-failure lifecycle.
  const removeArt = useCallback(
    (artId: string) => {
      const index = art.findIndex((item) => item.id === artId);
      if (index === -1) return;
      const removedArt = art[index];

      setArt((previous) => previous.filter((item) => item.id !== artId));
      setPendingArtDeletionIds((previous) => new Set(previous).add(artId));

      const toast = start(`remove-art-${artId}`);

      deleteArtRequest(artId)
        .then(() => {
          pruneHistoryEntriesForItem(artId);
          toast.markSaved();
        })
        .catch((error) => {
          setArt((previous) => {
            const restored = [...previous];
            restored.splice(index, 0, removedArt);
            return restored;
          });
          toast.markFailed(error);
          // Story 32: reload the complete binder graph when this removal was
          // rejected because the binder is now locked.
          if (isLockedBinderConflict(error)) retry();
        })
        .finally(() => {
          setPendingArtDeletionIds((previous) => {
            const next = new Set(previous);
            next.delete(artId);
            return next;
          });
        });
    },
    [art, setArt, pruneHistoryEntriesForItem, start, retry],
  );

  // Duplicates an art item into the unplaced-art section (story 26),
  // mirroring `createArt`'s optimistic-insert/replace-or-remove lifecycle.
  // A fresh `crypto.randomUUID()` idempotency key accompanies the request
  // (not reused across retries within this simple fire-once action) so a
  // dropped response the backend actually processed is still replayed
  // rather than silently duplicated if this action is ever retried.
  const duplicateArt = useCallback(
    (artId: string) => {
      const source = art.find((item) => item.id === artId);
      if (!source) return;

      const optimisticId = `optimistic-${crypto.randomUUID()}`;
      const idempotencyKey = crypto.randomUUID();
      const now = new Date().toISOString();
      const optimisticArt: Art = {
        ...source,
        id: optimisticId,
        placement: { physicalPage: null, row: null, column: null },
        createdAt: now,
        updatedAt: now,
      };

      setArt((previous) => [...previous, optimisticArt]);
      setPendingArtDuplicateIds((previous) => new Set(previous).add(optimisticId));

      const toast = start(`duplicate-art-${optimisticId}`);

      duplicateArtRequest(artId, idempotencyKey)
        .then((created) => {
          setArt((previous) => previous.map((item) => (item.id === optimisticId ? created : item)));
          toast.markSaved();
        })
        .catch((error) => {
          setArt((previous) => previous.filter((item) => item.id !== optimisticId));
          toast.markFailed(error);
          // Story 32: reload the complete binder graph when this
          // duplication was rejected because the binder is now locked.
          if (isLockedBinderConflict(error)) retry();
        })
        .finally(() => {
          setPendingArtDuplicateIds((previous) => {
            const next = new Set(previous);
            next.delete(optimisticId);
            return next;
          });
        });
    },
    [art, setArt, start, retry],
  );

  return {
    createArt,
    pendingUnplacedArtIds,
    artCreateRestore,
    clearArtCreateRestore,
    moveArt,
    editArt,
    pendingArtEditIds,
    artEditRestore,
    clearArtEditRestore,
    removeArt,
    pendingArtDeletionIds,
    duplicateArt,
    pendingArtDuplicateIds,
  };
}
