import { render, screen } from '@testing-library/react';

import { AppHeader } from '@/shared/navigation';

// AppHeader is mounted once in RootLayout so every page (including ones
// with no navigation of their own) always has a way back to the home page.
describe('AppHeader', () => {
  it('links back to the home page', () => {
    render(<AppHeader />);

    const link = screen.getByRole('link', { name: 'Binder Project Planner' });
    expect(link).toHaveAttribute('href', '/');
  });
});
