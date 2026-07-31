import { render, screen } from '@testing-library/react';

import Home from '@/app/page';

// The home page (story 4) now only offers the entry point into binder
// creation; the backend health check it used to render moved to its own
// /health page (see tests/app/health/page.test.tsx).
describe('Home', () => {
  it('shows a link to create a new binder', () => {
    render(<Home />);

    const link = screen.getByRole('link', { name: 'Create new binder' });
    expect(link).toHaveAttribute('href', '/binders/new');
  });
});
