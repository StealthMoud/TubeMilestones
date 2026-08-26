import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

async function renderDemo(name: string, path = '/') {
  window.location.hash = `#${path}?demo=${name}`;
  render(<App />);
  await screen.findByText('DEMO DATA');
}

describe('authenticated product fixtures', () => {
  it('renders connected Home and identifies demo data', async () => {
    await renderDemo('small');

    expect(
      await screen.findByRole('heading', { name: 'Here is where you stand.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('DEMO DATA')).toBeInTheDocument();
    expect(screen.getAllByText('Northstar Frames').length).toBeGreaterThan(0);
    expect(screen.getAllByText('742').length).toBeGreaterThan(0);
  });

  it('describes rounded subscriber precision without false exactness', async () => {
    await renderDemo('growing');

    expect(
      screen.getByText(/API rounds subscriber counts above 1K/),
    ).toBeInTheDocument();
  });

  it('shows an intentional hidden subscriber state', async () => {
    await renderDemo('hidden');

    expect(screen.getByText('Count hidden')).toBeInTheDocument();
    expect(
      screen.getByText(/This channel hides its subscriber count/),
    ).toBeInTheDocument();
  });

  it('switches Journey metrics and preserves historical wording', async () => {
    const user = userEvent.setup();
    await renderDemo('small', '/journey');

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Your milestone journey.' },
        { timeout: 10_000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Achieved before tracking').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Views' }));
    expect(screen.getByText('48.2K now')).toBeInTheDocument();
  });

  it('changes the Analytics range and provides a semantic summary', async () => {
    const user = userEvent.setup();
    await renderDemo('small', '/analytics');

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Recent channel movement.' },
        { timeout: 10_000 },
      ),
    ).toBeInTheDocument();
    const sevenDays = screen.getByRole('button', { name: '7D' });
    await user.click(sevenDays);
    expect(sevenDays).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/^Last 7 days:/)).toBeInTheDocument();
  });

  it('renders the no-Analytics state without blocking milestones', async () => {
    await renderDemo('no-analytics', '/analytics');

    expect(
      await screen.findByRole(
        'heading',
        { name: "Analytics isn't available yet." },
        { timeout: 10_000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/milestones still work normally/)).toBeInTheDocument();
  });

  it('requires confirmation before disconnecting in Settings', async () => {
    const user = userEvent.setup();
    await renderDemo('small', '/settings');

    expect(
      await screen.findByRole('heading', { name: 'Settings.' }, { timeout: 10_000 }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(
      screen.getByRole('dialog', { name: 'Disconnect YouTube?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Disconnect and delete' }),
    ).toBeInTheDocument();
  });
});
