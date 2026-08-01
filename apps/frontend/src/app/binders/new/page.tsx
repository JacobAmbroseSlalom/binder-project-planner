'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { createBinder } from '@/lib/api';
import { useSaveStatusToast } from '@/shared/feedback';
import {
  BinderDetailsForm,
  binderDetailsSchema,
  defaultBinderDetailsFormValues,
  type BinderDetailsFormInput,
  type BinderDetailsFormValues,
} from '@/shared/forms';

// The "Create a new binder" page (story 4). Renders the reusable
// binder-details form with Cancel/Create actions; the same form component
// also backs the view/edit page's "Edit Details" tab (story 7).

// Fixed (not per-submit-random) toast id so that resubmitting after a
// failed attempt replaces that failed toast rather than stacking a new
// "saving" toast on top of it.
const CREATE_BINDER_TOAST_ID = 'create-binder';

export default function NewBinderPage() {
  const router = useRouter();
  const { start } = useSaveStatusToast();

  const form = useForm<BinderDetailsFormInput, unknown, BinderDetailsFormValues>({
    resolver: zodResolver(binderDetailsSchema),
    defaultValues: defaultBinderDetailsFormValues,
  });

  const {
    handleSubmit,
    formState: { isSubmitting },
  } = form;

  // Submits the validated, trimmed form values to the backend. React Hook
  // Form's `isSubmitting` (derived from this async handler's pending
  // promise) disables Create while the request is in flight and flips
  // back to false once it settles either way, satisfying story 4's
  // "re-enabled if creation fails" rule without extra state.
  const onSubmit = handleSubmit(async (values) => {
    const toast = start(CREATE_BINDER_TOAST_ID);

    try {
      const created = await createBinder(values);
      toast.markSaved();
      // Per story 7's acceptance criteria, a newly created binder opens its
      // view/edit page with the "Edit Layout" tab selected.
      router.push(`/binders/${created.id}/layout`);
    } catch (error) {
      // Stay on the completed form so the user can retry (story 4).
      toast.markFailed(error);
    }
  });

  return (
    <main className="flex flex-col items-center gap-8 p-8">
      <h1>New Binder</h1>
      <form onSubmit={onSubmit} className="flex w-full max-w-2xl flex-col gap-8">
        <BinderDetailsForm form={form} disabled={isSubmitting} />
        <div className="flex justify-end gap-4">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => router.push('/')}
            className={`rounded-standard bg-neutral-800 px-4 py-2 font-bold hover:brightness-110 ${
              isSubmitting ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            }`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className={`rounded-standard bg-primary px-4 py-2 font-bold hover:brightness-110 ${
              isSubmitting ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            }`}
          >
            Create
          </button>
        </div>
      </form>
    </main>
  );
}
