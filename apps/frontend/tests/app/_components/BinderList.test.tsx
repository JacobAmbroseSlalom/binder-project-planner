import {
  DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_RADIUS_PERCENT,
  DEFAULT_BORDER_WIDTH_CM,
  DEFAULT_HEIGHT_BASE_CM,
  DEFAULT_HEIGHT_PER_SLOT_CM,
  DEFAULT_WIDTH_BASE_CM,
  DEFAULT_WIDTH_PER_SLOT_CM,
  LOADING_INDICATOR_DELAY_MS,
} from '@binder-project-planner/shared';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';

import { listBinders, type BinderSummary } from '@/lib/api';
import { BinderList } from '@/app/_components/BinderList';
import { ToastProvider } from '@/shared/feedback';

// The API client is mocked so these tests exercise BinderList's own state
// handling (loading -> success/empty/error) without a real network request.
jest.mock('@/lib/api', () => ({
  listBinders: jest.fn(),
}));

// BinderList calls useRouter (story 21's optimistic-copy navigation), which
// has no real implementation outside the Next.js router context, so it's
// mocked the same way the new-binder page's tests do.
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

const mockedListBinders = jest.mocked(listBinders);
const mockedUseRouter = jest.mocked(useRouter);

beforeEach(() => {
  mockedUseRouter.mockReturnValue({ push: jest.fn() } as unknown as ReturnType<typeof useRouter>);
});

// markFailed reads the failed toast through the real ToastProvider (as the
// component does via useToastContext), matching how other tests exercise
// the shared toast system rather than mocking it.
function renderBinderList() {
  return render(
    <ToastProvider>
      <BinderList />
    </ToastProvider>,
  );
}

function makeBinderSummary(overrides: Partial<BinderSummary>): BinderSummary {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'My Binder',
    width: 3,
    height: 3,
    pages: 20,
    // Story 24's dimension/style fields; BinderPreview reads widthPerSlot/
    // widthBase/heightPerSlot/heightBase for its slot aspect ratio, so
    // every summary needs valid values even when a test isn't exercising
    // story 24 behavior itself.
    widthPerSlot: DEFAULT_WIDTH_PER_SLOT_CM,
    widthBase: DEFAULT_WIDTH_BASE_CM,
    heightPerSlot: DEFAULT_HEIGHT_PER_SLOT_CM,
    heightBase: DEFAULT_HEIGHT_BASE_CM,
    borderColor: DEFAULT_BORDER_COLOR,
    borderRadius: DEFAULT_BORDER_RADIUS_PERCENT,
    borderWidth: DEFAULT_BORDER_WIDTH_CM,
    previewPhysicalPage: DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    // Story 20's embedded preview spread; BinderPreview destructures this
    // unconditionally, so every summary needs one even when a test isn't
    // exercising preview content itself.
    preview: { spread: { left: null, right: 1 }, cards: [], art: [] },
    ...overrides,
  };
}

describe('BinderList', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the loading indicator only once the request has been pending for LOADING_INDICATOR_DELAY_MS', () => {
    jest.useFakeTimers();
    mockedListBinders.mockReturnValue(new Promise(() => {}));

    renderBinderList();

    // The shared loading component (story 6) only appears after the delay,
    // so a fast response never flashes it.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(LOADING_INDICATOR_DELAY_MS);
    });

    expect(screen.getByRole('status')).toBeInTheDocument();
    // The empty state must not appear before loading completes, per story
    // 5's "not displayed until loading completes successfully" rule.
    expect(
      screen.queryByText('No binders yet. Create one to get started.'),
    ).not.toBeInTheDocument();
  });

  it('aborts the in-flight request through AbortController when the component unmounts before it resolves', () => {
    mockedListBinders.mockReturnValue(new Promise(() => {}));

    const { unmount } = renderBinderList();

    const [signal] = mockedListBinders.mock.calls[0];
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);

    unmount();

    // Story 6's technical requirement: an outstanding request is aborted so
    // its resolution can never update state after the component is gone.
    expect(signal?.aborted).toBe(true);
  });

  it('shows the empty state only after loading completes successfully with no binders', async () => {
    mockedListBinders.mockResolvedValue([]);

    renderBinderList();

    await waitFor(() =>
      expect(screen.getByText('No binders yet. Create one to get started.')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders the returned binders in the order provided by the backend', async () => {
    mockedListBinders.mockResolvedValue([
      makeBinderSummary({ id: '11111111-1111-1111-1111-111111111111', name: 'Newest Binder' }),
      makeBinderSummary({ id: '22222222-2222-2222-2222-222222222222', name: 'Oldest Binder' }),
    ]);

    renderBinderList();

    await waitFor(() => expect(screen.getByText('Newest Binder')).toBeInTheDocument());
    const names = screen.getAllByRole('listitem').map((item) => item.textContent);
    // The backend already returns binders in the documented sort order, so
    // the component must not re-sort them; "Newest Binder" stays first.
    expect(names[0]).toContain('Newest Binder');
    expect(names[1]).toContain('Oldest Binder');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('links each binder to its view/edit page with the Edit Layout tab selected (story 7)', async () => {
    mockedListBinders.mockResolvedValue([
      makeBinderSummary({ id: '11111111-1111-1111-1111-111111111111', name: 'My Binder' }),
    ]);

    renderBinderList();

    await waitFor(() => expect(screen.getByText('My Binder')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /My Binder/ })).toHaveAttribute(
      'href',
      '/binders/11111111-1111-1111-1111-111111111111/layout',
    );
  });

  it('removes the loading indicator and shows the failed toast when the list fails to load', async () => {
    mockedListBinders.mockRejectedValue({ detail: 'The binder list could not be loaded.' });

    renderBinderList();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('The binder list could not be loaded.'),
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(
      screen.queryByText('No binders yet. Create one to get started.'),
    ).not.toBeInTheDocument();
  });
});
