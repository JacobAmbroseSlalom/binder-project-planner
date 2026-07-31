import { render, screen, waitFor } from '@testing-library/react';

import { listBinders, type BinderSummary } from '@/lib/api';
import { BinderList } from '@/app/_components/BinderList';
import { ToastProvider } from '@/shared/feedback';

// The API client is mocked so these tests exercise BinderList's own state
// handling (loading -> success/empty/error) without a real network request.
jest.mock('@/lib/api', () => ({
  listBinders: jest.fn(),
}));

const mockedListBinders = jest.mocked(listBinders);

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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('BinderList', () => {
  it('shows the loading indicator while the binder list is being retrieved', () => {
    mockedListBinders.mockReturnValue(new Promise(() => {}));

    renderBinderList();

    expect(screen.getByRole('status')).toBeInTheDocument();
    // The empty state must not appear before loading completes, per story
    // 5's "not displayed until loading completes successfully" rule.
    expect(
      screen.queryByText('No binders yet. Create one to get started.'),
    ).not.toBeInTheDocument();
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
