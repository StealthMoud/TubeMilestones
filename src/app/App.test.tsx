import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renders the TubeMilestones foundation', async () => {
    window.location.hash = '#/';
    render(<App />);

    expect(
      await screen.findByRole('heading', {
        name: 'Your YouTube journey, one milestone at a time.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Google OAuth is not configured for this deployment.'),
    ).toBeInTheDocument();
  });
});
