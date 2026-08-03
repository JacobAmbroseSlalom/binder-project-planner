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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRouter, usePathname } from 'next/navigation';

import {
  getBinder,
  listBinderArt,
  listBinderCards,
  type Art,
  type Binder,
  type Card,
} from '@/lib/api';
import {
  BinderRouteProvider,
  useBinderRouteContext,
} from '@/app/binders/[binderId]/BinderRouteContext';
import { ToastProvider } from '@/shared/feedback';

// The API client is mocked so these tests exercise the provider's own
// loading/error/redirect handling without a real network request.
jest.mock('@/lib/api', () => ({
  getBinder: jest.fn(),
  listBinderCards: jest.fn(),
  listBinderArt: jest.fn(),
}));

// next/navigation's useRouter/usePathname have no real implementation
// outside the Next.js router context. usePathname is used internally by the
// rendered BinderTabs, so it's mocked too even though these tests don't
// assert on it directly.
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
}));

const mockedGetBinder = jest.mocked(getBinder);
const mockedListBinderCards = jest.mocked(listBinderCards);
const mockedListBinderArt = jest.mocked(listBinderArt);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUsePathname = jest.mocked(usePathname);

const BINDER_ID = '11111111-1111-1111-1111-111111111111';

function makeBinder(overrides: Partial<Binder> = {}): Binder {
  return {
    id: BINDER_ID,
    name: 'My Binder',
    width: 3,
    height: 3,
    pages: 20,
    // Story 24's dimension/style fields are required by `Binder`; using the
    // same canonical shared defaults `binderDetailsSchema` falls back to.
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
    ...overrides,
  };
}

// A minimal placed, TCGdex-sourced card, matching the `Card` schema, used to
// verify the provider forwards whatever `listBinderCards` resolves with
// without needing every test to restate every field.
function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    binderId: BINDER_ID,
    name: 'Pikachu',
    setName: 'Base Set',
    localNumber: '25',
    source: 'tcgdex',
    providerCardId: 'base1-25',
    providerSetId: 'base1',
    variation: null,
    placement: { physicalPage: 1, row: 0, column: 0 },
    imageUrl: '/cards/card-1/image',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// A minimal placed multi-slot art item, matching the `Art` schema, used to
// verify the provider forwards whatever `listBinderArt` resolves with
// without needing every test to restate every field.
function makeArt(overrides: Partial<Art> = {}): Art {
  return {
    id: 'art-1',
    binderId: BINDER_ID,
    title: 'My Art',
    description: null,
    widthSlots: 1,
    heightSlots: 1,
    placement: { physicalPage: 1, row: 0, column: 0 },
    imageUrl: '/art/art-1/image',
    imageRotationDegrees: 0,
    focalX: 0.5,
    focalY: 0.5,
    scaleX: 1,
    scaleY: 1,
    borderColor: null,
    borderRadius: null,
    borderWidth: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// A minimal consumer used to assert what the context actually publishes to
// nested tabs, mirroring how the real Edit Details tab reads it.
function Harness() {
  const { binder, cards, art } = useBinderRouteContext();
  return (
    <p>
      {binder.name} / cards:{cards.length} / art:{art.length}
    </p>
  );
}

function renderProvider() {
  return render(
    <ToastProvider>
      <BinderRouteProvider binderId={BINDER_ID}>
        <Harness />
      </BinderRouteProvider>
    </ToastProvider>,
  );
}

describe('BinderRouteProvider', () => {
  const push = jest.fn();
  const replace = jest.fn();

  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    mockedUseRouter.mockReturnValue({
      push,
      replace,
    } as unknown as ReturnType<typeof useRouter>);
    mockedUsePathname.mockReturnValue(`/binders/${BINDER_ID}/details`);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the loading indicator only once loading has been pending for LOADING_INDICATOR_DELAY_MS', () => {
    jest.useFakeTimers();
    mockedGetBinder.mockReturnValue(new Promise(() => {}));
    mockedListBinderCards.mockReturnValue(new Promise(() => {}));
    mockedListBinderArt.mockReturnValue(new Promise(() => {}));

    renderProvider();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(LOADING_INDICATOR_DELAY_MS);
    });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('loads binder, cards, and art in parallel and publishes them together to nested tabs', async () => {
    mockedGetBinder.mockResolvedValue(makeBinder());
    mockedListBinderCards.mockResolvedValue([makeCard()]);
    mockedListBinderArt.mockResolvedValue([makeArt({ id: 'art-1' }), makeArt({ id: 'art-2' })]);

    renderProvider();

    await waitFor(() =>
      expect(screen.getByText('My Binder / cards:1 / art:2')).toBeInTheDocument(),
    );
    // The route's heading and tab nav render once loaded, above the tabs'
    // own content (the Harness stand-in for nested tab children).
    expect(screen.getByRole('heading', { name: 'My Binder' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit Details' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('requests all three resources for the given binderId', async () => {
    mockedGetBinder.mockResolvedValue(makeBinder());
    mockedListBinderCards.mockResolvedValue([]);
    mockedListBinderArt.mockResolvedValue([]);

    renderProvider();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'My Binder' })).toBeInTheDocument(),
    );
    expect(mockedGetBinder).toHaveBeenCalledWith(BINDER_ID, expect.any(AbortSignal));
    expect(mockedListBinderCards).toHaveBeenCalledWith(BINDER_ID, expect.any(AbortSignal));
    expect(mockedListBinderArt).toHaveBeenCalledWith(BINDER_ID, expect.any(AbortSignal));
  });

  it('aborts every in-flight request through AbortController when the component unmounts', () => {
    mockedGetBinder.mockReturnValue(new Promise(() => {}));
    mockedListBinderCards.mockReturnValue(new Promise(() => {}));
    mockedListBinderArt.mockReturnValue(new Promise(() => {}));

    const { unmount } = renderProvider();

    const [, signal] = mockedGetBinder.mock.calls[0];
    expect(signal?.aborted).toBe(false);

    unmount();

    expect(signal?.aborted).toBe(true);
  });

  it('shows an error state with a Retry button when loading fails for a reason other than a missing/malformed binder', async () => {
    mockedGetBinder.mockRejectedValue({ detail: 'The server is temporarily unavailable.' });
    mockedListBinderCards.mockResolvedValue([]);
    mockedListBinderArt.mockResolvedValue([]);

    renderProvider();

    await waitFor(() =>
      expect(screen.getByText('The binder could not be loaded.')).toBeInTheDocument(),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('The server is temporarily unavailable.');
    expect(replace).not.toHaveBeenCalled();
  });

  it('re-runs all three requests when Retry is selected after a failure', async () => {
    mockedGetBinder
      .mockRejectedValueOnce({ detail: 'The server is temporarily unavailable.' })
      .mockResolvedValueOnce(makeBinder());
    mockedListBinderCards.mockResolvedValue([]);
    mockedListBinderArt.mockResolvedValue([]);

    renderProvider();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'My Binder' })).toBeInTheDocument(),
    );
    expect(mockedGetBinder).toHaveBeenCalledTimes(2);
    expect(mockedListBinderCards).toHaveBeenCalledTimes(2);
    expect(mockedListBinderArt).toHaveBeenCalledTimes(2);
  });

  it('redirects to the home page and shows a failed toast when the binder is not found (404)', async () => {
    mockedGetBinder.mockRejectedValue({
      status: 404,
      detail: `No binder exists with id "${BINDER_ID}".`,
    });
    mockedListBinderCards.mockResolvedValue([]);
    mockedListBinderArt.mockResolvedValue([]);

    renderProvider();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(screen.getByRole('alert')).toHaveTextContent(`No binder exists with id "${BINDER_ID}".`);
    // The error state's Retry button is never shown for this case, since
    // the user is navigated away instead.
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('redirects to the home page and shows a failed toast when the binderId is malformed (400)', async () => {
    mockedGetBinder.mockRejectedValue({
      status: 400,
      detail: 'The binderId path parameter is not a well-formed UUID.',
    });
    mockedListBinderCards.mockResolvedValue([]);
    mockedListBinderArt.mockResolvedValue([]);

    renderProvider();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The binderId path parameter is not a well-formed UUID.',
    );
  });
});
