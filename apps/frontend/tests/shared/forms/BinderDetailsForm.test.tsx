import { zodResolver } from '@hookform/resolvers/zod';
import {
  DEFAULT_BINDER_HEIGHT,
  DEFAULT_BINDER_PAGE_COUNT,
  DEFAULT_BINDER_WIDTH,
} from '@binder-project-planner/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import {
  BinderDetailsForm,
  binderDetailsSchema,
  defaultBinderDetailsFormValues,
  type BinderDetailsFormInput,
  type BinderDetailsFormValues,
} from '@/shared/forms';

// A minimal host that owns the useForm instance the same way a real page
// (e.g. the new-binder page) does, so BinderDetailsForm is exercised through
// its real registration/validation wiring rather than mocked form state.
// Submitting logs nothing; tests only need the resulting formState.
function Harness({ disabled }: { disabled?: boolean }) {
  const form = useForm<BinderDetailsFormInput, unknown, BinderDetailsFormValues>({
    resolver: zodResolver(binderDetailsSchema),
    defaultValues: defaultBinderDetailsFormValues,
  });

  return (
    <form onSubmit={form.handleSubmit(() => {})}>
      <BinderDetailsForm form={form} disabled={disabled} />
      <button type="submit">Submit</button>
    </form>
  );
}

describe('BinderDetailsForm', () => {
  it('renders name, width, height, and pages fields with their defaults', () => {
    render(<Harness />);

    expect(screen.getByLabelText('Binder name')).toHaveValue('');
    expect(screen.getByLabelText('Width (slots)')).toHaveValue(DEFAULT_BINDER_WIDTH);
    expect(screen.getByLabelText('Height (slots)')).toHaveValue(DEFAULT_BINDER_HEIGHT);
    expect(screen.getByLabelText('Pages (front and back)')).toHaveValue(DEFAULT_BINDER_PAGE_COUNT);
  });

  it('disables every field when disabled is true', () => {
    render(<Harness disabled />);

    expect(screen.getByLabelText('Binder name')).toBeDisabled();
    expect(screen.getByLabelText('Width (slots)')).toBeDisabled();
    expect(screen.getByLabelText('Height (slots)')).toBeDisabled();
    expect(screen.getByLabelText('Pages (front and back)')).toBeDisabled();
  });

  it('shows a validation error under the name field when it is left blank', async () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText('Binder name'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Binder name is required.');
  });

  it('shows a validation error under width when set below the minimum', async () => {
    render(<Harness />);

    const widthInput = screen.getByLabelText('Width (slots)');
    fireEvent.change(widthInput, { target: { value: '0' } });
    // Dispatching `submit` directly (rather than clicking the Submit button)
    // bypasses the browser's own HTML5 constraint validation against the
    // input's `min="1"` attribute, which would otherwise silently block
    // submission before React Hook Form's Zod validation ever runs.
    fireEvent.submit(widthInput.closest('form') as HTMLFormElement);

    expect(await screen.findByText('Width must be at least 1.')).toBeInTheDocument();
  });
});
