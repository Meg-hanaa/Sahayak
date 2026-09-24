import React from 'react';
import './Container.css';

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  as?: React.ElementType;
}

export const Container: React.FC<ContainerProps> = ({
  children,
  className = '',
  as: Component = 'div',
  ...rest
}) => {
  return (
    <Component className={`sahayak-container ${className}`.trim()} {...rest}>
      {children}
    </Component>
  );
};
