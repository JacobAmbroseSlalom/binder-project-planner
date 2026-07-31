import { render, screen } from '@testing-library/react';

import { listBinders } from '@/lib/api';
import Home from '@/app/page';
import { ToastProvider } from '@/shared/feedback';

// Home now also renders BinderList (story 5), which calls listBinders and
// reads the shared toast context, so this test mocks the API and wraps
// the page in ToastProvider the same way RootLayout does.
jest.mock('@/lib/api', () => ({
  listBinders: jest.fn(),
}));

const mockedListBinders = jest.mocked(listBinders);

describe('Home', () => {
  it('shows a link to create a new binder', () => {
    mockedListBinders.mockReturnValue(new Promise(() => {}));

    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    const link = screen.getByRole('link', { name: 'Create new binder' });
    expect(link).toHaveAttribute('href', '/binders/new');
  });
});
