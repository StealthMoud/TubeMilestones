import { useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { BrandMark } from '../../components/common/BrandMark';
import { Button } from '../../components/common/Button';
import { applicationAuthErrorMessage } from '../../auth/authErrors';
import {
  AUTH_PASSWORD_MAX_LENGTH,
  authPasswordConfirmationError,
  authPasswordError,
} from '../../auth/validation';

interface PasswordRecoveryPageProps {
  updatePassword(password: string): Promise<User>;
  completePasswordRecovery(): void;
}

function passwordValue(form: HTMLFormElement, name: string): string {
  return String(new FormData(form).get(name) ?? '');
}

export function PasswordRecoveryPage({
  updatePassword,
  completePasswordRecovery,
}: PasswordRecoveryPageProps) {
  const [pending, setPending] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const password = passwordValue(form, 'password');
    const confirmation = passwordValue(form, 'confirmPassword');
    const validation =
      authPasswordError(password) ??
      authPasswordConfirmationError(password, confirmation);
    if (validation) {
      setError(validation);
      form.reset();
      return;
    }
    setPending(true);
    setError(null);
    try {
      await updatePassword(password);
      form.reset();
      setUpdated(true);
    } catch (requestError) {
      form.reset();
      setError(applicationAuthErrorMessage(requestError));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="recovery-page">
      <header className="recovery-header">
        <a className="landing-brand" href="#/" aria-label="TubeMilestones home">
          <BrandMark size={34} />
          <span>TubeMilestones</span>
        </a>
      </header>
      <main className="recovery-main">
        <section className="recovery-panel" aria-labelledby="recovery-title">
          <span className="auth-panel__step">Secure account recovery</span>
          <h1 id="recovery-title">Choose a new password</h1>
          {updated ? (
            <div className="recovery-success" role="status" aria-live="polite">
              <strong>Password updated.</strong>
              <p>Your TubeMilestones account is ready.</p>
              <Button onClick={completePasswordRecovery}>
                Continue to TubeMilestones
              </Button>
            </div>
          ) : (
            <form className="auth-form" onSubmit={submit} noValidate>
              <label className="form-field">
                <span>New password</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={AUTH_PASSWORD_MAX_LENGTH}
                  disabled={pending}
                  required
                />
              </label>
              <label className="form-field">
                <span>Confirm new password</span>
                <input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={AUTH_PASSWORD_MAX_LENGTH}
                  disabled={pending}
                  required
                />
              </label>
              {error ? (
                <p className="form-error" role="alert" aria-live="assertive">
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={pending}>
                {pending ? 'Updating…' : 'Update password'}
              </Button>
            </form>
          )}
        </section>
      </main>
      <footer className="recovery-footer">
        <a href="./privacy.html">Privacy</a>
        <a href="./terms.html">Terms</a>
      </footer>
    </div>
  );
}
