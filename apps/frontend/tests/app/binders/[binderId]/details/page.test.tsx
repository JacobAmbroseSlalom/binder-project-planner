import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { useBinderRouteContext } from '@/app/binders/[binderId]/BinderRouteContext';
import BinderDetailsPage from '@/app/binders/[binderId]/details/page';
import { updateBinder, type Binder } from '@/lib/api';
import { ToastProvider } from '@/shared/feedback';

// The API client is mocked so these tests exercise the page's own
// save-on-blur handling without a real network request.
jest.mock('@/lib/api', () => ({
  updateBinder: jest.fn(),
}));

// The shared binder route context is mocked so these tests can control the
// seed binder values directly, rather than depending on BinderRouteContext's
// own loading behavior (covered separately in BinderRouteContext.test.tsx).
jest.mock('@/app/binders/[binderId]/BinderRouteContext', () => ({
  useBinderRouteContext: jest.fn(),
}));

const mockedUpdateBinder = jest.mocked(updateBinder);
const mockedUseBinderRouteContext = jest.mocked(useBinderRouteContext);

const BINDER: Binder = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'My Binder',
  width: 3,
  height: 3,
  pages: 20,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderPage(updateBinderContext: jest.Mock = jest.fn()) {
  mockedUseBinderRouteContext.mockReturnValue({
    binder: BINDER,
    cards: [],
    art: [],
    updateBinder: updateBinderContext,
  });

  return render(
    <ToastProvider>
      <BinderDetailsPage />
    </ToastProvider>,
  );
}

describe('BinderDetailsPage (Edit Details tab)', () => {
  it('prefills the form from the binder route context, with no loading of its own', () => {
    renderPage();

    expect(screen.getByLabelText('Binder name')).toHaveValue('My Binder');
    expect(screen.getByLabelText('Width (slots)')).toHaveValue(3);
    expect(screen.getByLabelText('Height (slots)')).toHaveValue(3);
    expect(screen.getByLabelText('Pages (front and back)')).toHaveValue(20);
  });

  it('does not save when a field is blurred without any change', () => {
    renderPage();

    fireEvent.blur(screen.getByLabelText('Binder name'));

    expect(mockedUpdateBinder).not.toHaveBeenCalled();
  });

  it('saves only the changed, valid field on blur and syncs the context and form from the response', async () => {
    mockedUpdateBinder.mockResolvedValue({ ...BINDER, name: 'New Name' });
    const updateBinderContext = jest.fn();
    renderPage(updateBinderContext);

    fireEvent.change(screen.getByLabelText('Binder name'), { target: { value: 'New Name' } });
    fireEvent.blur(screen.getByLabelText('Binder name'));

    await waitFor(() =>
      expect(mockedUpdateBinder).toHaveBeenCalledWith(BINDER.id, { name: 'New Name' }),
    );
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
    expect(updateBinderContext).toHaveBeenCalledWith({ ...BINDER, name: 'New Name' });
  });

  it('leaves an invalid dirty field out of the save and sends no request when nothing else is dirty', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('Width (slots)'), { target: { value: '0' } });
    fireEvent.blur(screen.getByLabelText('Width (slots)'));

    await waitFor(() => expect(screen.getByText('Width must be at least 1.')).toBeInTheDocument());
    expect(mockedUpdateBinder).not.toHaveBeenCalled();
  });

  it('shows a failed toast on save failure, leaving the field dirty so the next blur retries it', async () => {
    mockedUpdateBinder
      .mockRejectedValueOnce({ detail: 'A binder named "New Name" already exists.' })
      .mockResolvedValueOnce({ ...BINDER, name: 'New Name' });
    renderPage();

    fireEvent.change(screen.getByLabelText('Binder name'), { target: { value: 'New Name' } });
    fireEvent.blur(screen.getByLabelText('Binder name'));

    await waitFor(() =>
      expect(screen.getByText('A binder named "New Name" already exists.')).toBeInTheDocument(),
    );

    // The failed save left the name field dirty with the user's value, so a
    // later blur (e.g. the user re-confirming) submits the same patch again.
    fireEvent.blur(screen.getByLabelText('Binder name'));

    await waitFor(() => expect(mockedUpdateBinder).toHaveBeenCalledTimes(2));
    expect(mockedUpdateBinder).toHaveBeenNthCalledWith(2, BINDER.id, { name: 'New Name' });
  });

  it('serializes saves: a blur while one is in flight is queued into a single follow-up save', async () => {
    let resolveFirst!: (value: Binder) => void;
    mockedUpdateBinder.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    renderPage();

    fireEvent.change(screen.getByLabelText('Binder name'), { target: { value: 'First Change' } });
    fireEvent.blur(screen.getByLabelText('Binder name'));

    await waitFor(() => expect(mockedUpdateBinder).toHaveBeenCalledTimes(1));

    // A second blur happens (a different field) while the first save is
    // still in flight.
    fireEvent.change(screen.getByLabelText('Height (slots)'), { target: { value: '5' } });
    fireEvent.blur(screen.getByLabelText('Height (slots)'));

    // The second blur must be queued, not fired as an overlapping request.
    expect(mockedUpdateBinder).toHaveBeenCalledTimes(1);

    mockedUpdateBinder.mockResolvedValueOnce({ ...BINDER, height: 5 });
    resolveFirst({ ...BINDER, name: 'First Change' });

    // The name field is clean again after the first save succeeds, so the
    // queued follow-up save only submits the still-dirty height field.
    await waitFor(() => expect(mockedUpdateBinder).toHaveBeenCalledTimes(2));
    expect(mockedUpdateBinder).toHaveBeenNthCalledWith(2, BINDER.id, { height: 5 });
  });
});
