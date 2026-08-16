import '@testing-library/jest-dom';

// jsdom (the test environment) has no `ResizeObserver` implementation, but
// `useElementSize` (used by the binder settings preview panels) requires one
// to observe its element's rendered size. A minimal stub - one that never
// actually fires callbacks, since these tests don't assert on live-resize
// behavior - is enough to let components using it mount without throwing.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver = ResizeObserverStub;
