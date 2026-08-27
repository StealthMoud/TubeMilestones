import { useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { applicationAuthErrorMessage } from '../../auth/authErrors';
import type { ApplicationSignInMethods } from '../../auth/authMethods';
import {
  AUTH_PASSWORD_MAX_LENGTH,
  authPasswordConfirmationError,
  authPasswordError,
} from '../../auth/validation';
import { Button } from '../../components/common/Button';
import { PasswordField } from '../../components/common/PasswordField';

interface SignInMethodsSettingsProps {
  methods: ApplicationSignInMethods;
  updatePassword(password: string): Promise<User>;
  disabled?: boolean;
}

function passwordValue(form: HTMLFormElement, name: string): string {
  return String(new FormData(form).get(name) ?? '');
}

export function SignInMethodsSettings({
  methods,
  updatePassword,
  disabled = false,
}: SignInMethodsSettingsProps) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [passwordAdded, setPasswordAdded] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const passwordEnabled = methods.password || passwordAdded;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || disabled) return;
    const form = event.currentTarget;
    const password = passwordValue(form, 'password');
    const confirmation = passwordValue(form, 'confirmPassword');
    const validation =
      authPasswordError(password) ??
      authPasswordConfirmationError(password, confirmation);
    if (validation) {
      setError(validation);
      setSuccess(null);
      form.reset();
      return;
    }
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      await updatePassword(password);
      form.reset();
      setPasswordAdded(true);
      setEditing(false);
      setSuccess(
        passwordEnabled
          ? 'Password changed successfully.'
          : 'Email and password sign-in is now enabled.',
      );
    } catch (requestError) {
      form.reset();
      setError(applicationAuthErrorMessage(requestError));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="sign-in-methods">
      <div className="sign-in-methods__heading">
        <div>
          <strong>Sign-in methods</strong>
          <span>These identify your TubeMilestones account only.</span>
        </div>
      </div>
      <div className="sign-in-methods__list">
        {methods.google ? (
          <div className="sign-in-methods__row">
            <span>Google</span>
            <strong className="settings-status">Connected</strong>
          </div>
        ) : null}
        <div className="sign-in-methods__row">
          <span>Email &amp; password</span>
          <strong className={`settings-status${passwordEnabled ? '' : ' is-neutral'}`}>
            {passwordEnabled ? 'Enabled' : 'Not configured'}
          </strong>
        </div>
      </div>

      {editing ? (
        <form className="password-settings-form" onSubmit={submit} noValidate>
          <PasswordField
            label="New password"
            name="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={AUTH_PASSWORD_MAX_LENGTH}
            disabled={pending || disabled}
            required
          />
          <PasswordField
            label="Confirm new password"
            name="confirmPassword"
            autoComplete="new-password"
            minLength={8}
            maxLength={AUTH_PASSWORD_MAX_LENGTH}
            disabled={pending || disabled}
            required
          />
          {error ? (
            <p className="form-error" role="alert" aria-live="assertive">
              {error}
            </p>
          ) : null}
          <div className="password-settings-form__actions">
            <Button
              variant="quiet"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || disabled}>
              {pending
                ? passwordEnabled
                  ? 'Changing…'
                  : 'Adding…'
                : passwordEnabled
                  ? 'Change password'
                  : 'Add password'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="sign-in-methods__actions">
          {success ? (
            <p className="sign-in-methods__success" role="status" aria-live="polite">
              {success}
            </p>
          ) : null}
          {error ? (
            <p className="form-error" role="alert" aria-live="assertive">
              {error}
            </p>
          ) : null}
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => {
              setEditing(true);
              setError(null);
              setSuccess(null);
            }}
          >
            {passwordEnabled ? 'Change password' : 'Add password'}
          </Button>
        </div>
      )}
    </div>
  );
}
