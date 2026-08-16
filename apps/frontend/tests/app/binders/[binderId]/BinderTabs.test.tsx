import { render, screen } from '@testing-library/react';
import { usePathname, useRouter } from 'next/navigation';

import { BinderTabs } from '@/app/binders/[binderId]/BinderTabs';

// next/navigation's usePathname/useRouter have no real implementation
// outside the Next.js router context. usePathname controls which tab is
// "active" per test; useRouter is mocked too since BinderTabs also calls it
// (for its unsaved-changes-guarded navigation, story 38) even though these
// tests don't assert on it directly.
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
}));

const mockedUsePathname = jest.mocked(usePathname);
const mockedUseRouter = jest.mocked(useRouter);

const BINDER_ID = '11111111-1111-1111-1111-111111111111';

describe('BinderTabs', () => {
  beforeEach(() => {
    mockedUseRouter.mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
    } as unknown as ReturnType<typeof useRouter>);
  });

  it('links Edit Details and Edit Layout to their nested routes', () => {
    mockedUsePathname.mockReturnValue(`/binders/${BINDER_ID}/details`);

    render(<BinderTabs binderId={BINDER_ID} />);

    expect(screen.getByRole('link', { name: 'Edit Details' })).toHaveAttribute(
      'href',
      `/binders/${BINDER_ID}/details`,
    );
    expect(screen.getByRole('link', { name: 'Edit Layout' })).toHaveAttribute(
      'href',
      `/binders/${BINDER_ID}/layout`,
    );
  });

  it('marks the tab matching the current pathname as the active page', () => {
    mockedUsePathname.mockReturnValue(`/binders/${BINDER_ID}/details`);

    render(<BinderTabs binderId={BINDER_ID} />);

    expect(screen.getByRole('link', { name: 'Edit Details' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Edit Layout' })).not.toHaveAttribute('aria-current');
  });

  it('links View Financials to its nested route now that story 34 has enabled it', () => {
    mockedUsePathname.mockReturnValue(`/binders/${BINDER_ID}/layout`);

    render(<BinderTabs binderId={BINDER_ID} />);

    // Story 34 enabled this tab (it was previously a disabled, non-navigable
    // placeholder per story 7).
    expect(screen.getByRole('link', { name: 'View Financials' })).toHaveAttribute(
      'href',
      `/binders/${BINDER_ID}/financials`,
    );
  });
});
