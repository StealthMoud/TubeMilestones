import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  label: ReactNode;
}

export function PasswordField({
  label,
  id,
  className = '',
  disabled,
  ...inputProps
}: PasswordFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  const actionLabel = visible ? 'Hide password' : 'Show password';
  const VisibilityIcon = visible ? EyeOff : Eye;

  return (
    <div className="form-field password-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="password-field__control">
        <input
          {...inputProps}
          id={inputId}
          className={className}
          type={visible ? 'text' : 'password'}
          disabled={disabled}
        />
        <button
          className="password-visibility-toggle"
          type="button"
          aria-label={actionLabel}
          aria-pressed={visible}
          aria-controls={inputId}
          title={actionLabel}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setVisible((current) => !current)}
        >
          <VisibilityIcon size={18} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
