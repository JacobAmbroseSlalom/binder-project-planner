import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';

import { BinderTabs } from '@/app/binders/[binderId]/BinderTabs';

// next/navigation's usePathname has no real implementation outside the
// Next.js router context, so it's mocked to control which tab is "active"
// per test.
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

const mockedUsePathname = jest.mocked(usePathname);

const BINDER_ID = '11111111-1111-1111-1111-111111111111';

describe('BinderTabs', () => {
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

  it('renders the disabled View Financials tab as a non-navigable span rather than a link', () => {
    mockedUsePathname.mockReturnValue(`/binders/${BINDER_ID}/layout`);

    render(<BinderTabs binderId={BINDER_ID} />);

    // Per story 7, the Financials tab has no page yet and must not be
    // focusable/navigable until its story lands.
    expect(screen.queryByRole('link', { name: 'View Financials' })).not.toBeInTheDocument();
    const financialsTab = screen.getByText('View Financials');
    expect(financialsTab.tagName).toBe('SPAN');
    expect(financialsTab).toHaveAttribute('aria-disabled', 'true');
  });
});
