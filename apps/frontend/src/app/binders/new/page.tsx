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
// binder-details form with Cancel/Create actions; after story 7 lands,
// this same form component will also back the view/edit page's "Edit
// Details" tab.
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
    const toast = start();

    try {
      await createBinder(values);
      toast.markSaved();
      // The binder view/edit page doesn't exist yet (story 7); per story 4's
      // acceptance criteria, creation returns the user to the home page.
      router.push('/');
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
