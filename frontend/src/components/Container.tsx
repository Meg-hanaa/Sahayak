import React from 'react';
import './Container.css';

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  as?: React.ElementType;
  size?: 'sm' | 'md' | 'lg' | 'full';
}

export const Container: React.FC<ContainerProps> = ({
  children,
  className = '',
  as: Component = 'div',
  size = 'lg',
  ...rest
}) => {
  const sizeClass = size ? `sahayak-container--${size}` : '';
  return (
    <Component className={`sahayak-container ${sizeClass} ${className}`.trim()} {...rest}>
      {children}
    </Component>
  );
};
