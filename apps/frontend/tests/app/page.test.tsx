import { render, screen } from '@testing-library/react';
import { useRouter } from 'next/navigation';

import { listBinders } from '@/lib/api';
import Home from '@/app/page';
import { ToastProvider } from '@/shared/feedback';

// Home now also renders BinderList (story 5), which calls listBinders and
// reads the shared toast context, so this test mocks the API and wraps
// the page in ToastProvider the same way RootLayout does.
jest.mock('@/lib/api', () => ({
  listBinders: jest.fn(),
}));

// BinderList (rendered by Home) calls useRouter (story 21's optimistic-copy
// navigation), which has no real implementation outside the Next.js router
// context, so it's mocked the same way the new-binder page's tests do.
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

const mockedListBinders = jest.mocked(listBinders);
const mockedUseRouter = jest.mocked(useRouter);

beforeEach(() => {
  mockedUseRouter.mockReturnValue({ push: jest.fn() } as unknown as ReturnType<typeof useRouter>);
});

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
