import { fireEvent, render, screen } from '@testing-library/react';

import { Toast } from '@/shared/feedback/Toast';
import type { ToastEntry } from '@/shared/feedback/types';

// Covers story 3's per-status rendering requirements: a saving toast that
// stays visible, a green saved toast, and a red failed toast with a
// user-dismiss control. Colors are asserted through the Tailwind tokens
// documented in styling.instructions.md (bg-success / bg-error) since exact
// hex values are defined once there rather than duplicated here.
describe('Toast', () => {
  it('renders a saving toast in a polite live region', () => {
    const toast: ToastEntry = { id: 'op-1', status: 'saving' };

    render(<Toast toast={toast} onDismiss={jest.fn()} />);

    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('Saving…');
  });

  it('renders a saved toast with a default message and success styling', () => {
    const toast: ToastEntry = { id: 'op-1', status: 'saved' };

    render(<Toast toast={toast} onDismiss={jest.fn()} />);

    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('Saved');
    expect(region).toHaveClass('bg-success');
  });

  it('renders a saved toast with a custom message when provided', () => {
    const toast: ToastEntry = { id: 'op-1', status: 'saved', message: 'Successfully deleted' };

    render(<Toast toast={toast} onDismiss={jest.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('Successfully deleted');
  });

  it('renders a failed toast as an alert with the backend detail and error styling', () => {
    const toast: ToastEntry = {
      id: 'op-1',
      status: 'failed',
      detail: 'A binder with this name already exists.',
    };

    render(<Toast toast={toast} onDismiss={jest.fn()} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('A binder with this name already exists.');
    expect(alert).toHaveClass('bg-error');
  });

  it('calls onDismiss when the failed toast X button is selected', () => {
    const toast: ToastEntry = { id: 'op-1', status: 'failed', detail: 'Network error.' };
    const onDismiss = jest.fn();

    render(<Toast toast={toast} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
