import { DEFAULT_CARD_ACQUIRED } from '@binder-project-planner/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

import type { CustomCardFormValues } from '../../../BinderRouteContext';
import {
  defaultManualCardFormValues,
  manualCardSchema,
  type ManualCardFormValues,
} from './manualCardSchema';

// `CardSelectionModal`'s manual-entry view's own form/file/preview state
// and Add-Card/Add-More submission handlers (story 12; Add More added in
// story 18), extracted out of that component (which was growing past this
// house-cleaning pass's line-count threshold) - mirrors the search view's
// own extracted `useCardCatalogSearch`/`useCardSelectionState` hooks.
export function useManualCardEntry({
  initialManualEntry,
  onSubmitCustomCard,
  onSubmitCustomCardAddMore,
  resolveTargetPlacement,
  markSubmitted,
  variation,
  acquired,
  setVariation,
  setAcquired,
}: {
  // Seeds the form/file when this modal is reopened to correct a failed
  // custom-card submission (see `CardSelectionModal`'s own prop doc
  // comment).
  initialManualEntry?: { values: CustomCardFormValues; file: File };
  onSubmitCustomCard: (
    values: CustomCardFormValues,
    file: File,
    targetPlacement: { physicalPage: number; row: number; column: number } | null,
  ) => void;
  onSubmitCustomCardAddMore: (
    values: CustomCardFormValues,
    file: File,
    targetPlacement: { physicalPage: number; row: number; column: number } | null,
  ) => Promise<boolean>;
  // Resolves this session's target placement for the *next* submission
  // (story 17) - owned by `CardSelectionModal` since it's shared with the
  // search view's own submissions.
  resolveTargetPlacement: () => { physicalPage: number; row: number; column: number } | null;
  // Marks this modal session as having submitted at least once (story
  // 17) - owned by `CardSelectionModal` for the same reason.
  markSubmitted: () => void;
  // The shared variation/acquired fields (story 16/36) live in
  // `CardSelectionModal` since both views read/write them.
  variation: string;
  acquired: boolean;
  setVariation: (value: string) => void;
  setAcquired: (value: boolean) => void;
}) {
  const [customCardFile, setCustomCardFile] = useState<File | null>(
    initialManualEntry?.file ?? null,
  );
  // Shown only after a submit attempt without a file selected yet
  // (planning.md: "An image is required before a custom card can be
  // added").
  const [fileError, setFileError] = useState<string | undefined>(undefined);
  // Story 18's Add-More flow: tracked locally (rather than through the
  // shared `isBulkAddPending` context flag) so an Add-More submission
  // disables this view's own controls while awaited, independent of
  // whatever other pending state the binder context tracks.
  const [isCustomAddMoreSubmitting, setIsCustomAddMoreSubmitting] = useState(false);
  const manualForm = useForm<ManualCardFormValues>({
    resolver: zodResolver(manualCardSchema),
    defaultValues: initialManualEntry
      ? {
          name: initialManualEntry.values.name,
          setName: initialManualEntry.values.setName ?? '',
          localNumber: initialManualEntry.values.localNumber ?? '',
        }
      : defaultManualCardFormValues,
  });

  // A local object-URL preview of the selected file (decoupled from the
  // separate object URL the route context creates for the optimistic
  // card's `imageUrl` once submitted), so this modal's own preview never
  // leaks a blob URL. `URL.createObjectURL` is a pure, synchronous
  // derivation of `customCardFile`, so it's computed via `useMemo` (not
  // `useEffect` + `useState`) - storing it as effect-driven state would
  // trip React Compiler's `react-hooks/set-state-in-effect` rule, since
  // nothing here is actually waiting on an external async event. A
  // separate cleanup-only effect (no `setState` call of its own) revokes
  // each created url once it's no longer the current one or on unmount.
  const customCardPreviewUrl = useMemo(
    () => (customCardFile ? URL.createObjectURL(customCardFile) : null),
    [customCardFile],
  );
  useEffect(() => {
    return () => {
      if (customCardPreviewUrl) URL.revokeObjectURL(customCardPreviewUrl);
    };
  }, [customCardPreviewUrl]);

  function handleCustomCardFileChange(nextFile: File | null) {
    setCustomCardFile(nextFile);
    if (nextFile) setFileError(undefined);
  }

  // Submits the manual-entry form's "Add Card" (story 12). A file is
  // required independently of the RHF/Zod-validated text fields (see
  // `manualCardSchema.ts`'s comment), so it's checked here rather than
  // through the form's own validation.
  const handleManualSubmit = manualForm.handleSubmit((values) => {
    if (!customCardFile) {
      setFileError('An image is required.');
      return;
    }
    const targetPlacement = resolveTargetPlacement();
    markSubmitted();
    onSubmitCustomCard(
      {
        name: values.name,
        setName: values.setName.trim() || null,
        localNumber: values.localNumber.trim() || null,
        variation: variation.trim() || null,
        acquired,
      },
      customCardFile,
      targetPlacement,
    );
  });

  // The manual-entry view's own "Add More" (story 18), mirroring the
  // search view's `handleAddMoreCards`: awaited so the form (and its
  // selected file) only clears on complete success, keeping everything in
  // place for correction on failure.
  const handleManualAddMore = manualForm.handleSubmit(async (values) => {
    if (!customCardFile) {
      setFileError('An image is required.');
      return;
    }
    if (isCustomAddMoreSubmitting) return;
    const targetPlacement = resolveTargetPlacement();
    markSubmitted();
    setIsCustomAddMoreSubmitting(true);
    try {
      const succeeded = await onSubmitCustomCardAddMore(
        {
          name: values.name,
          setName: values.setName.trim() || null,
          localNumber: values.localNumber.trim() || null,
          variation: variation.trim() || null,
          acquired,
        },
        customCardFile,
        targetPlacement,
      );
      if (succeeded) {
        manualForm.reset(defaultManualCardFormValues);
        setCustomCardFile(null);
        setVariation('');
        setAcquired(DEFAULT_CARD_ACQUIRED);
        setFileError(undefined);
      }
    } finally {
      setIsCustomAddMoreSubmitting(false);
    }
  });

  return {
    customCardFile,
    customCardPreviewUrl,
    fileError,
    manualForm,
    isCustomAddMoreSubmitting,
    handleCustomCardFileChange,
    handleManualSubmit,
    handleManualAddMore,
  };
}
