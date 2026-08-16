import { render, screen } from '@testing-library/react';
import { useRouter } from 'next/navigation';

import { AppHeader } from '@/shared/navigation';

// next/navigation's useRouter has no real implementation outside the
// Next.js router context, and AppHeader calls it directly (for its
// unsaved-changes-guarded navigation, story 38).
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

const mockedUseRouter = jest.mocked(useRouter);

// AppHeader is mounted once in RootLayout so every page (including ones
// with no navigation of their own) always has a way back to the home page.
describe('AppHeader', () => {
  beforeEach(() => {
    mockedUseRouter.mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
    } as unknown as ReturnType<typeof useRouter>);
  });

  it('links back to the home page', () => {
    render(<AppHeader />);

    const link = screen.getByRole('link', { name: 'Binder Project Planner' });
    expect(link).toHaveAttribute('href', '/');
  });
});
