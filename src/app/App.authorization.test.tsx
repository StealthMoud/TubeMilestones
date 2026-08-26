import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { App } from './App';

vi.mock('../services/google/identity', () => ({
  googleClientId: () => 'test-client.apps.googleusercontent.com',
  isGoogleOAuthConfigured: () => true,
  loadGoogleIdentityServices: () => Promise.resolve(),
  requestGoogleAccessToken: () => new Promise(() => undefined),
  revokeGoogleAccess: () => Promise.resolve(),
}));

describe('authorization interaction', () => {
  it('enters an explicit authorizing state after a user gesture', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/';
    render(<App />);

    const connect = await screen.findByRole('button', { name: 'Connect YouTube' });
    await user.click(connect);

    expect(screen.getByRole('button', { name: 'Connecting...' })).toBeDisabled();
  });
});
