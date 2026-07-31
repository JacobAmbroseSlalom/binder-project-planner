import { render, screen, waitFor } from '@testing-library/react';

import { getHealth } from '@/lib/api';

import Home from './page';

// The API client is mocked so this test exercises the page's own state handling
// (loading → connected/error) without making a real network request.
jest.mock('@/lib/api', () => ({
  getHealth: jest.fn(),
}));

const mockedGetHealth = jest.mocked(getHealth);

describe('Home', () => {
  it('shows a loading message before the backend responds', () => {
    mockedGetHealth.mockReturnValue(new Promise(() => {}));

    render(<Home />);

    expect(screen.getByTestId('backend-status')).toHaveTextContent('Checking backend connection');
  });

  it('shows the connected backend status once the health check succeeds', async () => {
    mockedGetHealth.mockResolvedValue({ status: 'ok', database: 'connected' });

    render(<Home />);

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

    render(<Home />);

    await waitFor(() =>
      expect(screen.getByTestId('backend-status')).toHaveTextContent(
        'Backend connection failed: network error',
      ),
    );
  });
});
