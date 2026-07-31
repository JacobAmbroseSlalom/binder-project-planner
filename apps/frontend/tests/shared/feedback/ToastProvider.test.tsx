import { SAVED_TOAST_DURATION_MS } from '@binder-project-planner/shared';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';

import { ToastProvider, useSaveStatusToast, useToastContext } from '@/shared/feedback';
import type { SaveStatusToastHandle } from '@/shared/feedback';

// A minimal consumer used to drive the toast system the same way a real
// mutation would: call start() when the operation begins, then markSaved()
// or markFailed() once it settles. Each button targets one operation id so
// tests can assert that concurrent mutations are tracked independently, per
// story 3's acceptance criteria.
function Harness() {
  const { start } = useSaveStatusToast();
  const handles = useRef<Record<string, SaveStatusToastHandle>>({});

  return (
    <div>
      <button onClick={() => (handles.current.a = start('op-a'))}>Start A</button>
      <button onClick={() => (handles.current.b = start('op-b'))}>Start B</button>
      <button onClick={() => handles.current.a?.markSaved()}>Save A</button>
      <button onClick={() => handles.current.b?.markSaved('B saved custom')}>Save B</button>
      <button onClick={() => handles.current.a?.markFailed({ detail: 'A failed.' })}>Fail A</button>
      <button onClick={() => handles.current.b?.markFailed({ detail: 'B failed.' })}>Fail B</button>
    </div>
  );
}

describe('ToastProvider / useSaveStatusToast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows a saving toast when an operation begins', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText('Start A'));

    expect(screen.getByRole('status')).toHaveTextContent('Saving…');
  });

  it('tracks concurrent operations as independently updated toasts', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText('Start A'));
    fireEvent.click(screen.getByText('Start B'));
    expect(screen.getAllByRole('status')).toHaveLength(2);

    // Resolving operation A must not change operation B's still-pending toast.
    fireEvent.click(screen.getByText('Save A'));

    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.getAllByRole('status').some((el) => el.textContent?.includes('Saving…'))).toBe(
      true,
    );
  });

  it('replaces the saving toast with a saved toast that auto-dismisses after SAVED_TOAST_DURATION_MS', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText('Start A'));
    fireEvent.click(screen.getByText('Save A'));

    expect(screen.getByText('Saved')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(SAVED_TOAST_DURATION_MS);
    });

    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('supports a custom saved message', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText('Start B'));
    fireEvent.click(screen.getByText('Save B'));

    expect(screen.getByText('B saved custom')).toBeInTheDocument();
  });

  it('replaces the saving toast with a failed toast that displays the backend detail and does not auto-dismiss', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText('Start A'));
    fireEvent.click(screen.getByText('Fail A'));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('A failed.');

    // A failed toast has no auto-dismiss timer, unlike a saved toast, so it
    // must still be visible well past SAVED_TOAST_DURATION_MS.
    act(() => {
      jest.advanceTimersByTime(SAVED_TOAST_DURATION_MS * 10);
    });

    expect(screen.getByRole('alert')).toHaveTextContent('A failed.');
  });

  it('dismisses a failed toast only when the user selects its X button', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText('Start A'));
    fireEvent.click(screen.getByText('Fail A'));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('throws when useToastContext is used outside a ToastProvider', () => {
    // React logs the thrown render error to console.error; silence it so the
    // expected failure doesn't clutter test output.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    function Unwrapped() {
      useToastContext();
      return null;
    }

    expect(() => render(<Unwrapped />)).toThrow(
      'useToastContext must be used within a ToastProvider.',
    );

    consoleError.mockRestore();
  });
});
