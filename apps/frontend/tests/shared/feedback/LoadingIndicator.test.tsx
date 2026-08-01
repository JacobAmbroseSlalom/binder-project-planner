import { render, screen } from '@testing-library/react';

import { LoadingIndicator } from '@/shared/feedback';

describe('LoadingIndicator', () => {
  it('renders a status region announcing the provided accessible label', () => {
    render(<LoadingIndicator label="Loading binders…" />);

    // `role="status"` gives the indicator the same polite-live-region
    // accessibility behavior as the shared "saving" toast (story 3),
    // satisfying story 6's "selected library's default accessibility
    // behavior" requirement without a UI component library.
    expect(screen.getByRole('status')).toHaveTextContent('Loading binders…');
  });

  it('hides the spinner icon from the accessibility tree, leaving only the label as the accessible content', () => {
    render(<LoadingIndicator label="Loading binders…" />);

    const status = screen.getByRole('status');
    // The spinner is purely decorative; only the sr-only label should be
    // exposed to assistive tech, matching the "accessible status label"
    // technical requirement.
    expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('renders distinct context-specific labels wherever it appears', () => {
    const { rerender } = render(<LoadingIndicator label="Loading binders…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading binders…');

    rerender(<LoadingIndicator label="Loading cards…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading cards…');
  });
});
