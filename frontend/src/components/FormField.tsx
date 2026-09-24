import React, { useId } from 'react';
import './FormField.css';

export interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
  error?: string;
  containerClassName?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  id,
  label,
  helperText,
  error,
  required,
  className = '',
  containerClassName = '',
  'aria-describedby': userDescribedBy,
  'aria-invalid': userAriaInvalid,
  ...restInputProps
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;

  // Merge aria-describedby deliberately and only reference elements rendered in the DOM
  const activeDescribedBy: string[] = [];
  if (userDescribedBy) {
    activeDescribedBy.push(userDescribedBy);
  }
  if (error) {
    activeDescribedBy.push(errorId);
  } else if (helperText) {
    activeDescribedBy.push(helperId);
  }
  const finalDescribedBy =
    activeDescribedBy.length > 0 ? activeDescribedBy.join(' ') : undefined;

  const isInvalid =
    error !== undefined ? Boolean(error) : Boolean(userAriaInvalid);

  return (
    <div className={`sahayak-form-field ${containerClassName}`.trim()}>
      <label htmlFor={inputId} className="sahayak-form-field__label">
        {label}
        {required && (
          <span className="sahayak-form-field__required" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <input
        {...restInputProps}
        id={inputId}
        required={required}
        aria-invalid={isInvalid}
        aria-describedby={finalDescribedBy}
        className={`sahayak-form-field__input ${className}`.trim()}
      />
      {error && (
        <p id={errorId} className="sahayak-form-field__error" role="alert">
          {error}
        </p>
      )}
      {!error && helperText && (
        <p id={helperId} className="sahayak-form-field__helper">
          {helperText}
        </p>
      )}
    </div>
  );
};
