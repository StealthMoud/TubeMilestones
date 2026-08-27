import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from '@supabase/supabase-js';
import { SignInMethodsSettings } from './SignInMethodsSettings';

const GOOGLE_USER = {
  id: 'a02769a3-6ba2-4bbb-bca5-4e50e7468c44',
  email: 'creator@example.com',
} as User;

describe('SignInMethodsSettings', () => {
  it('adds password sign-in to an existing Google user', async () => {
    const user = userEvent.setup();
    const updatePassword = vi.fn().mockResolvedValue(GOOGLE_USER);
    render(
      <SignInMethodsSettings
        methods={{ google: true, password: false }}
        updatePassword={updatePassword}
      />,
    );
    expect(screen.getByText('Google').closest('div')).toHaveTextContent('Connected');
    expect(screen.getByText('Email & password').closest('div')).toHaveTextContent(
      'Not configured',
    );

    await user.click(screen.getByRole('button', { name: 'Add password' }));
    const password = screen.getByLabelText('New password');
    const confirmation = screen.getByLabelText('Confirm new password');
    const visibilityToggles = screen.getAllByRole('button', {
      name: 'Show password',
    });
    expect(visibilityToggles).toHaveLength(2);
    await user.click(visibilityToggles[1]!);
    expect(password).toHaveAttribute('type', 'password');
    expect(confirmation).toHaveAttribute('type', 'text');
    await user.type(password, 'new password');
    await user.type(confirmation, 'new password');
    await user.click(screen.getByRole('button', { name: 'Add password' }));

    expect(updatePassword).toHaveBeenCalledWith('new password');
    expect(screen.getByText('Email & password').closest('div')).toHaveTextContent(
      'Enabled',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Email and password sign-in is now enabled.',
    );
  });

  it('changes an existing password and validates confirmation', async () => {
    const user = userEvent.setup();
    const updatePassword = vi.fn().mockResolvedValue(GOOGLE_USER);
    render(
      <SignInMethodsSettings
        methods={{ google: false, password: true }}
        updatePassword={updatePassword}
      />,
    );
    expect(screen.getByText('Google').closest('div')).toHaveTextContent(
      'Not connected',
    );
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getAllByRole('button', { name: 'Show password' })).toHaveLength(2);
    await user.type(screen.getByLabelText('New password'), 'new password');
    await user.type(screen.getByLabelText('Confirm new password'), 'not matching');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match.');
    expect(updatePassword).not.toHaveBeenCalled();
  });
});
