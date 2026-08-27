import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApplicationAuthPanel } from './ApplicationAuthPanel';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function setup(
  overrides: Partial<React.ComponentProps<typeof ApplicationAuthPanel>> = {},
) {
  const props: React.ComponentProps<typeof ApplicationAuthPanel> = {
    configured: true,
    signInWithGoogle: vi.fn().mockResolvedValue(undefined),
    signInWithPassword: vi.fn().mockResolvedValue(undefined),
    signUpWithPassword: vi.fn().mockResolvedValue({
      status: 'CONFIRMATION_REQUIRED',
      email: 'creator@example.com',
    }),
    requestPasswordReset: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<ApplicationAuthPanel {...props} />);
  return props;
}

async function completeSignIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email'), ' creator@example.com ');
  await user.type(screen.getByLabelText('Password'), 'password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

async function openSignup(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  expect(
    screen.getByRole('heading', { name: 'Create your TubeMilestones account' }),
  ).toBeVisible();
}

describe('ApplicationAuthPanel', () => {
  it('submits normal password login and clears the password field', async () => {
    const user = userEvent.setup();
    const props = setup();
    await completeSignIn(user);
    expect(props.signInWithPassword).toHaveBeenCalledWith(
      'creator@example.com',
      'password',
    );
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('shows safe invalid-credential and unconfirmed-email errors', async () => {
    const user = userEvent.setup();
    const signInWithPassword = vi
      .fn()
      .mockRejectedValueOnce({
        code: 'invalid_credentials',
        message: 'raw internal provider response',
      })
      .mockRejectedValueOnce({ code: 'email_not_confirmed' });
    setup({ signInWithPassword });

    await completeSignIn(user);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Email or password is incorrect.',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('raw internal');

    await user.type(screen.getByLabelText('Password'), 'password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please confirm your email before signing in.',
    );
  });

  it('disables every auth action while login is pending', async () => {
    const user = userEvent.setup();
    const pending = deferred<void>();
    const signInWithPassword = vi.fn(() => pending.promise);
    setup({ signInWithPassword });
    await user.type(screen.getByLabelText('Email'), 'creator@example.com');
    await user.type(screen.getByLabelText('Password'), 'password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Signing in…' }));
    expect(signInWithPassword).toHaveBeenCalledOnce();
    await act(async () => pending.resolve());
  });

  it('validates weak and mismatched signup passwords before Supabase', async () => {
    const user = userEvent.setup();
    const props = setup();
    await openSignup(user);
    await user.type(screen.getByLabelText('Email'), 'creator@example.com');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.type(screen.getByLabelText('Confirm password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Password must be at least 8 characters.',
    );
    expect(props.signUpWithPassword).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Password'), 'password');
    await user.type(screen.getByLabelText('Confirm password'), 'different');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match.');
    expect(props.signUpWithPassword).not.toHaveBeenCalled();
  });

  it('shows the confirmation-required signup transition', async () => {
    const user = userEvent.setup();
    const props = setup();
    await openSignup(user);
    await user.type(screen.getByLabelText('Email'), ' creator@example.com ');
    await user.type(screen.getByLabelText('Password'), 'password');
    await user.type(screen.getByLabelText('Confirm password'), 'password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(props.signUpWithPassword).toHaveBeenCalledWith(
      'creator@example.com',
      'password',
    );
    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    expect(screen.getByText('creator@example.com')).toBeVisible();
  });

  it('supports immediate-session signup without hard-coding confirmation', async () => {
    const user = userEvent.setup();
    const signUpWithPassword = vi.fn().mockResolvedValue({
      status: 'SIGNED_IN',
      email: 'creator@example.com',
    });
    setup({ signUpWithPassword });
    await openSignup(user);
    await user.type(screen.getByLabelText('Email'), 'creator@example.com');
    await user.type(screen.getByLabelText('Password'), 'password');
    await user.type(screen.getByLabelText('Confirm password'), 'password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(signUpWithPassword).toHaveBeenCalledOnce();
    expect(screen.queryByRole('heading', { name: 'Check your email' })).toBeNull();
  });

  it('maps signup backend failures to a generic message', async () => {
    const user = userEvent.setup();
    setup({
      signUpWithPassword: vi.fn().mockRejectedValue({
        code: 'unexpected_backend_failure',
        message: 'sensitive provider detail',
      }),
    });
    await openSignup(user);
    await user.type(screen.getByLabelText('Email'), 'creator@example.com');
    await user.type(screen.getByLabelText('Password'), 'password');
    await user.type(screen.getByLabelText('Confirm password'), 'password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't complete that request. Try again shortly.",
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('sensitive');
  });

  it('uses an anti-enumeration response for password reset', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await user.type(screen.getByLabelText('Email'), 'unknown@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset instructions' }));
    expect(props.requestPasswordReset).toHaveBeenCalledWith('unknown@example.com');
    expect(screen.getByRole('status')).toHaveTextContent(
      "If an account exists for that email, we've sent password-reset instructions.",
    );
    expect(screen.getByRole('status')).not.toHaveTextContent('unknown@example.com');
  });

  it('keeps Google Client A as an explicit secondary action', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(props.signInWithGoogle).toHaveBeenCalledOnce();
  });
});
