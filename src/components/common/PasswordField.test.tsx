import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasswordField } from './PasswordField';

describe('PasswordField', () => {
  it('is hidden by default with an accessible show control', () => {
    render(
      <PasswordField
        label="Password"
        name="password"
        autoComplete="current-password"
        defaultValue="private value"
      />,
    );
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'autocomplete',
      'current-password',
    );
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute(
      'title',
      'Show password',
    );
  });

  it('reveals and hides the DOM value without replacing it', async () => {
    const user = userEvent.setup();
    render(
      <PasswordField
        label="Password"
        name="password"
        autoComplete="new-password"
        defaultValue="private value"
      />,
    );
    const input = screen.getByLabelText('Password');
    input.focus();

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveValue('private value');
    expect(input).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'title',
      'Hide password',
    );

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveValue('private value');
  });

  it('keeps confirmation visibility independent', async () => {
    const user = userEvent.setup();
    render(
      <>
        <PasswordField label="New password" name="password" />
        <PasswordField label="Confirm new password" name="confirmPassword" />
      </>,
    );
    const password = screen.getByLabelText('New password');
    const confirmation = screen.getByLabelText('Confirm new password');
    const toggles = screen.getAllByRole('button', { name: 'Show password' });

    await user.click(toggles[1]!);
    expect(password).toHaveAttribute('type', 'password');
    expect(confirmation).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('uses a non-submitting button', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(
      <form onSubmit={submit}>
        <PasswordField label="Password" name="password" />
      </form>,
    );
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveAttribute('type', 'button');
    await user.click(toggle);
    expect(submit).not.toHaveBeenCalled();
  });
});
