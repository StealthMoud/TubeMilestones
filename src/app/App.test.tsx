import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renders the TubeMilestones foundation', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', {
        name: 'Your YouTube journey, one milestone at a time.',
      }),
    ).toBeInTheDocument();
  });
});
