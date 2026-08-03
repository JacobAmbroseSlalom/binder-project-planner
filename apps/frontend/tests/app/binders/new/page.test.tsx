import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';

import {
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_RADIUS_PERCENT,
  DEFAULT_BORDER_WIDTH_CM,
  DEFAULT_HEIGHT_BASE_CM,
  DEFAULT_HEIGHT_PER_SLOT_CM,
  DEFAULT_WIDTH_BASE_CM,
  DEFAULT_WIDTH_PER_SLOT_CM,
  DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE,
} from '@binder-project-planner/shared';

import { createBinder } from '@/lib/api';
import { ToastProvider } from '@/shared/feedback';
import NewBinderPage from '@/app/binders/new/page';

// Story 24's dimension/style fields are now required by the binder-details
// form; every test that submits the form or asserts on a created binder's
// shape spreads this so each test only overrides the field(s) it's
// actually exercising, using the same canonical shared defaults the form
// itself falls back to.
const dimensionFields = {
  widthPerSlot: DEFAULT_WIDTH_PER_SLOT_CM,
  widthBase: DEFAULT_WIDTH_BASE_CM,
  heightPerSlot: DEFAULT_HEIGHT_PER_SLOT_CM,
  heightBase: DEFAULT_HEIGHT_BASE_CM,
  borderColor: DEFAULT_BORDER_COLOR,
  borderRadius: DEFAULT_BORDER_RADIUS_PERCENT,
  borderWidth: DEFAULT_BORDER_WIDTH_CM,
  previewPhysicalPage: DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE,
};

// The API client is mocked so these tests exercise the page's own submit
// handling (disabling Create, navigating, showing toasts) without making a
// real network request.
jest.mock('@/lib/api', () => ({
  createBinder: jest.fn(),
}));

// next/navigation's useRouter has no real implementation outside the Next.js
// router context, so it's mocked to capture push() calls.
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

const mockedCreateBinder = jest.mocked(createBinder);
const mockedUseRouter = jest.mocked(useRouter);

// useSaveStatusToast requires a ToastProvider ancestor (mounted in the real
// app by RootLayout), so tests wrap the page the same way.
function renderPage() {
  return render(
    <ToastProvider>
      <NewBinderPage />
    </ToastProvider>,
  );
}

describe('NewBinderPage', () => {
  const push = jest.fn();

  beforeEach(() => {
    push.mockReset();
    mockedUseRouter.mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
  });

  it('renders the binder-details form with its default values', () => {
    renderPage();

    expect(screen.getByLabelText('Binder name')).toHaveValue('');
    expect(screen.getByLabelText('Width (slots)')).toHaveValue(3);
    expect(screen.getByLabelText('Height (slots)')).toHaveValue(3);
    expect(screen.getByLabelText('Pages (front and back)')).toHaveValue(20);
  });

  it('returns to the home page without creating a binder when Cancel is selected', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(push).toHaveBeenCalledWith('/');
    expect(mockedCreateBinder).not.toHaveBeenCalled();
  });

  it('creates the binder with the trimmed, parsed form values and opens its view/edit page on the Edit Layout tab', async () => {
    mockedCreateBinder.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'My Binder',
      width: 3,
      height: 3,
      pages: 20,
      ...dimensionFields,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderPage();

    fireEvent.change(screen.getByLabelText('Binder name'), {
      target: { value: '  My Binder  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(mockedCreateBinder).toHaveBeenCalledWith({
        name: 'My Binder',
        width: 3,
        height: 3,
        pages: 20,
        ...dimensionFields,
      }),
    );
    // Story 7: a newly created binder opens its view/edit page with the
    // Edit Layout tab selected, rather than returning to the home page.
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/binders/11111111-1111-1111-1111-111111111111/layout'),
    );
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('disables Create while the request is in flight and re-enables it if creation fails', async () => {
    let rejectCreate!: (error: unknown) => void;
    mockedCreateBinder.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectCreate = reject;
      }),
    );
    renderPage();

    fireEvent.change(screen.getByLabelText('Binder name'), { target: { value: 'My Binder' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled());

    rejectCreate({ detail: 'A binder named "My Binder" already exists.' });

    // Creation failing re-enables Create and keeps the user on the completed
    // form (no navigation) so they can retry, per story 4's acceptance
    // criteria.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled());
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText('A binder named "My Binder" already exists.')).toBeInTheDocument();
  });
});
