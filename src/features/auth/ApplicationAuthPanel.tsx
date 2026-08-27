import { useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/common/Button';
import type { PasswordSignUpResult } from '../../auth/AuthProvider';
import { applicationAuthErrorMessage } from '../../auth/authErrors';
import {
  AUTH_EMAIL_MAX_LENGTH,
  AUTH_PASSWORD_MAX_LENGTH,
  authEmailError,
  authPasswordConfirmationError,
  authPasswordError,
  normalizeAuthEmail,
} from '../../auth/validation';

type AuthMode = 'SIGN_IN' | 'SIGN_UP' | 'FORGOT' | 'CHECK_EMAIL';

interface ApplicationAuthPanelProps {
  configured: boolean;
  signInWithGoogle(): Promise<void>;
  signInWithPassword(email: string, password: string): Promise<void>;
  signUpWithPassword(email: string, password: string): Promise<PasswordSignUpResult>;
  requestPasswordReset(email: string): Promise<void>;
}

function formValue(form: HTMLFormElement, name: string): string {
  return String(new FormData(form).get(name) ?? '');
}

function clearPasswordFields(form: HTMLFormElement): void {
  for (const name of ['password', 'confirmPassword']) {
    const input = form.elements.namedItem(name);
    if (input instanceof HTMLInputElement) input.value = '';
  }
}

export function ApplicationAuthPanel({
  configured,
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
  requestPasswordReset,
}: ApplicationAuthPanelProps) {
  const [mode, setMode] = useState<AuthMode>('SIGN_IN');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const [resetRequested, setResetRequested] = useState(false);
  const panel = useRef<HTMLElement>(null);

  const selectMode = (nextMode: AuthMode) => {
    if (pending) return;
    setMode(nextMode);
    setError(null);
    setResetRequested(false);
    queueMicrotask(() =>
      panel.current?.querySelector<HTMLInputElement>('input')?.focus(),
    );
  };

  const submitSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const email = normalizeAuthEmail(formValue(form, 'email'));
    const password = formValue(form, 'password');
    const validation = authEmailError(email) ?? authPasswordError(password);
    if (validation) {
      setError(validation);
      clearPasswordFields(form);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await signInWithPassword(email, password);
    } catch (requestError) {
      setError(applicationAuthErrorMessage(requestError));
    } finally {
      clearPasswordFields(form);
      setPending(false);
    }
  };

  const submitSignUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const email = normalizeAuthEmail(formValue(form, 'email'));
    const password = formValue(form, 'password');
    const confirmation = formValue(form, 'confirmPassword');
    const validation =
      authEmailError(email) ??
      authPasswordError(password) ??
      authPasswordConfirmationError(password, confirmation);
    if (validation) {
      setError(validation);
      clearPasswordFields(form);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await signUpWithPassword(email, password);
      form.reset();
      if (result.status === 'CONFIRMATION_REQUIRED') {
        setConfirmationEmail(result.email);
        setMode('CHECK_EMAIL');
      }
    } catch (requestError) {
      setError(applicationAuthErrorMessage(requestError));
    } finally {
      clearPasswordFields(form);
      setPending(false);
    }
  };

  const submitForgot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const email = normalizeAuthEmail(formValue(form, 'email'));
    const validation = authEmailError(email);
    if (validation) {
      setError(validation);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      form.reset();
      setResetRequested(true);
    } catch (requestError) {
      setError(applicationAuthErrorMessage(requestError));
    } finally {
      setPending(false);
    }
  };

  const launchGoogle = async () => {
    if (pending || !configured) return;
    setPending(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (requestError) {
      setError(applicationAuthErrorMessage(requestError));
    } finally {
      setPending(false);
    }
  };

  if (mode === 'CHECK_EMAIL') {
    return (
      <section className="auth-panel" aria-labelledby="auth-panel-title" ref={panel}>
        <div className="auth-panel__confirmation" role="status">
          <span className="auth-panel__step">Account confirmation</span>
          <h2 id="auth-panel-title">Check your email</h2>
          <p>
            We sent a confirmation link to <strong>{confirmationEmail}</strong>.
          </p>
          <p>Confirm your email to finish creating your TubeMilestones account.</p>
        </div>
        <button
          className="auth-link"
          type="button"
          onClick={() => selectMode('SIGN_IN')}
        >
          Back to sign in
        </button>
      </section>
    );
  }

  if (mode === 'FORGOT') {
    return (
      <section className="auth-panel" aria-labelledby="auth-panel-title" ref={panel}>
        <div className="auth-panel__heading">
          <span className="auth-panel__step">Account recovery</span>
          <h2 id="auth-panel-title">Reset your password</h2>
          <p>Enter the email used for your TubeMilestones account.</p>
        </div>
        {resetRequested ? (
          <div className="auth-panel__success" role="status" aria-live="polite">
            If an account exists for that email, we've sent password-reset instructions.
          </div>
        ) : (
          <form className="auth-form" onSubmit={submitForgot} noValidate>
            <label className="form-field">
              <span>Email</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                maxLength={AUTH_EMAIL_MAX_LENGTH}
                disabled={pending || !configured}
                required
              />
            </label>
            <Button type="submit" disabled={pending || !configured}>
              {pending ? 'Sending…' : 'Send reset instructions'}
            </Button>
          </form>
        )}
        {error ? (
          <p className="form-error" role="alert" aria-live="assertive">
            {error}
          </p>
        ) : null}
        <button
          className="auth-link"
          type="button"
          disabled={pending}
          onClick={() => selectMode('SIGN_IN')}
        >
          Back to sign in
        </button>
      </section>
    );
  }

  const signingUp = mode === 'SIGN_UP';
  return (
    <section
      className="auth-panel"
      aria-labelledby="auth-panel-title"
      aria-busy={pending}
      ref={panel}
    >
      <div className="auth-panel__heading">
        <span className="auth-panel__step">
          {signingUp ? 'New account' : 'TubeMilestones account'}
        </span>
        <h2 id="auth-panel-title">
          {signingUp
            ? 'Create your TubeMilestones account'
            : 'Sign in to TubeMilestones'}
        </h2>
      </div>

      <form
        className="auth-form"
        onSubmit={signingUp ? submitSignUp : submitSignIn}
        noValidate
      >
        <label className="form-field">
          <span>Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={AUTH_EMAIL_MAX_LENGTH}
            disabled={pending || !configured}
            required
          />
        </label>
        <label className="form-field">
          <span>Password</span>
          <input
            name="password"
            type="password"
            autoComplete={signingUp ? 'new-password' : 'current-password'}
            minLength={8}
            maxLength={AUTH_PASSWORD_MAX_LENGTH}
            disabled={pending || !configured}
            required
          />
        </label>
        {signingUp ? (
          <label className="form-field">
            <span>Confirm password</span>
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={AUTH_PASSWORD_MAX_LENGTH}
              disabled={pending || !configured}
              required
            />
          </label>
        ) : null}
        {!signingUp ? (
          <button
            className="auth-link auth-link--forgot"
            type="button"
            disabled={pending}
            onClick={() => selectMode('FORGOT')}
          >
            Forgot password?
          </button>
        ) : null}
        <Button type="submit" disabled={pending || !configured}>
          {pending
            ? signingUp
              ? 'Creating account…'
              : 'Signing in…'
            : signingUp
              ? 'Create account'
              : 'Sign in'}
        </Button>
      </form>

      {error ? (
        <p className="form-error" role="alert" aria-live="assertive">
          {error}
        </p>
      ) : null}

      <div className="auth-divider" role="separator" aria-label="or">
        <span>or</span>
      </div>
      <Button
        variant="secondary"
        className="auth-panel__google"
        disabled={pending || !configured}
        onClick={() => void launchGoogle()}
      >
        Continue with Google
      </Button>

      <p className="auth-panel__switch">
        {signingUp ? 'Already have an account?' : "Don't have an account?"}{' '}
        <button
          className="auth-link"
          type="button"
          disabled={pending}
          onClick={() => selectMode(signingUp ? 'SIGN_IN' : 'SIGN_UP')}
        >
          {signingUp ? 'Sign in' : 'Create account'}
        </button>
      </p>
      <p className="auth-panel__separation">
        Your TubeMilestones login is separate from the YouTube accounts you connect.
      </p>
    </section>
  );
}
