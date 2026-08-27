import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from '@supabase/supabase-js';
import { PasswordRecoveryPage } from './PasswordRecoveryPage';

const USER = {
  id: 'a02769a3-6ba2-4bbb-bca5-4e50e7468c44',
  email: 'creator@example.com',
} as User;

describe('PasswordRecoveryPage', () => {
  it('rejects mismatched confirmation before updating the user', async () => {
    const user = userEvent.setup();
    const updatePassword = vi.fn().mockResolvedValue(USER);
    render(
      <PasswordRecoveryPage
        updatePassword={updatePassword}
        completePasswordRecovery={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText('New password'), 'password');
    await user.type(screen.getByLabelText('Confirm new password'), 'different');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match.');
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('updates the password and requires an explicit success transition', async () => {
    const user = userEvent.setup();
    const updatePassword = vi.fn().mockResolvedValue(USER);
    const completePasswordRecovery = vi.fn();
    render(
      <PasswordRecoveryPage
        updatePassword={updatePassword}
        completePasswordRecovery={completePasswordRecovery}
      />,
    );
    await user.type(screen.getByLabelText('New password'), 'new password');
    await user.type(screen.getByLabelText('Confirm new password'), 'new password');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(updatePassword).toHaveBeenCalledWith('new password');
    expect(screen.getByRole('status')).toHaveTextContent('Password updated.');
    await user.click(
      screen.getByRole('button', { name: 'Continue to TubeMilestones' }),
    );
    expect(completePasswordRecovery).toHaveBeenCalledOnce();
  });
});
