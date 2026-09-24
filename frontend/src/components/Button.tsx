import React from 'react';
import './Button.css';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  type = 'button',
  disabled = false,
  className = '',
  children,
  ...rest
}) => {
  const buttonClass = [
    'sahayak-button',
    `sahayak-button--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      disabled={disabled}
      aria-disabled={disabled}
      className={buttonClass}
      {...rest}
    >
      {children}
    </button>
  );
};
