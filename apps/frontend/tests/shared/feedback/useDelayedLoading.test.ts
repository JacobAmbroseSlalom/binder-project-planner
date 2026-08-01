import {
  LOADING_INDICATOR_DELAY_MS,
  LOADING_INDICATOR_MIN_DURATION_MS,
} from '@binder-project-planner/shared';
import { act, renderHook } from '@testing-library/react';

import { useDelayedLoading } from '@/shared/feedback';

// Exercises story 6's display-timing technical requirements in isolation
// from any consumer component: the indicator only appears after a request
// has been pending for LOADING_INDICATOR_DELAY_MS, and once shown stays
// visible for at least LOADING_INDICATOR_MIN_DURATION_MS.
describe('useDelayedLoading', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not report visible immediately when a request starts pending', () => {
    const { result } = renderHook(() => useDelayedLoading(true));

    expect(result.current).toBe(false);
  });

  it('becomes visible once the request has been pending for LOADING_INDICATOR_DELAY_MS', () => {
    const { result } = renderHook(() => useDelayedLoading(true));

    act(() => {
      jest.advanceTimersByTime(LOADING_INDICATOR_DELAY_MS);
    });

    expect(result.current).toBe(true);
  });

  it('never becomes visible for a request that settles before LOADING_INDICATOR_DELAY_MS elapses', () => {
    const { result, rerender } = renderHook(({ isPending }) => useDelayedLoading(isPending), {
      initialProps: { isPending: true },
    });

    act(() => {
      jest.advanceTimersByTime(LOADING_INDICATOR_DELAY_MS - 1);
    });
    rerender({ isPending: false });

    // The delay timer was cancelled by the settle before it ever fired, so
    // the indicator must not flash on even once the full delay has elapsed.
    act(() => {
      jest.advanceTimersByTime(LOADING_INDICATOR_DELAY_MS);
    });
    expect(result.current).toBe(false);
  });

  it('remains visible for at least LOADING_INDICATOR_MIN_DURATION_MS after the request settles', () => {
    const { result, rerender } = renderHook(({ isPending }) => useDelayedLoading(isPending), {
      initialProps: { isPending: true },
    });

    act(() => {
      jest.advanceTimersByTime(LOADING_INDICATOR_DELAY_MS);
    });
    expect(result.current).toBe(true);

    rerender({ isPending: false });

    // Just before the minimum duration elapses, the indicator must still be
    // visible so loaded content doesn't flicker in too soon.
    act(() => {
      jest.advanceTimersByTime(LOADING_INDICATOR_MIN_DURATION_MS - 1);
    });
    expect(result.current).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);
  });

  it('hides promptly once the request settles after the minimum duration has already elapsed', () => {
    const { result, rerender } = renderHook(({ isPending }) => useDelayedLoading(isPending), {
      initialProps: { isPending: true },
    });

    act(() => {
      // The indicator has been visible for well over the minimum duration
      // by the time the request finally settles.
      jest.advanceTimersByTime(LOADING_INDICATOR_DELAY_MS + LOADING_INDICATOR_MIN_DURATION_MS * 5);
    });
    expect(result.current).toBe(true);

    rerender({ isPending: false });

    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(result.current).toBe(false);
  });
});
