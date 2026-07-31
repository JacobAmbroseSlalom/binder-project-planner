import { render, screen, waitFor } from '@testing-library/react';

import { getHealth } from '@/lib/api';
import HealthPage from '@/app/health/page';

// The API client is mocked so this test exercises the page's own state
// handling (loading → connected/error) without making a real network
// request. These scenarios previously lived on the home page's test before
// the health check moved to its own /health page.
jest.mock('@/lib/api', () => ({
  getHealth: jest.fn(),
}));

const mockedGetHealth = jest.mocked(getHealth);

describe('HealthPage', () => {
  it('shows a loading message before the backend responds', () => {
    mockedGetHealth.mockReturnValue(new Promise(() => {}));

    render(<HealthPage />);

    expect(screen.getByTestId('backend-status')).toHaveTextContent('Checking backend connection');
  });

  it('shows the connected backend status once the health check succeeds', async () => {
    mockedGetHealth.mockResolvedValue({ status: 'ok', database: 'connected' });

    render(<HealthPage />);

    // The status paragraph is present immediately (in its loading state), so
    // waitFor is needed to retry the assertion until the effect's async
    // getHealth() call resolves and re-renders with the connected state.
    await waitFor(() =>
      expect(screen.getByTestId('backend-status')).toHaveTextContent(
        'Backend connected (database: connected).',
      ),
    );
  });

  it('shows an error message when the health check fails', async () => {
    mockedGetHealth.mockRejectedValue(new Error('network error'));

    render(<HealthPage />);

    await waitFor(() =>
      expect(screen.getByTestId('backend-status')).toHaveTextContent(
        'Backend connection failed: network error',
      ),
    );
  });
});
