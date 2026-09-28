import React from 'react';
import { Link } from 'react-router-dom';
import { Container } from './Container';
import './TaskHeader.css';

export interface TaskHeaderProps {
  homeLabel?: string;
  badge?: string;
  containerSize?: 'sm' | 'md' | 'lg' | 'full';
}

export const TaskHeader: React.FC<TaskHeaderProps> = ({
  homeLabel = 'Sahayak homepage',
  badge,
  containerSize = 'md',
}) => {
  return (
    <header className="sahayak-task-header">
      <Container size={containerSize} className="sahayak-task-header__container">
        <div className="sahayak-task-header__inner">
          <div className="sahayak-task-header__brand-group">
            <Link to="/" className="sahayak-task-header__brand" aria-label={homeLabel}>
              <img
                src="/images/logo.png"
                alt=""
                aria-hidden="true"
                className="sahayak-task-header__logo"
                width="30"
                height="30"
              />
              <span className="sahayak-task-header__wordmark">Sahayak</span>
            </Link>
            {badge && (
              <>
                <span className="sahayak-task-header__divider" aria-hidden="true">
                  /
                </span>
                <span className="sahayak-task-header__badge" title={badge}>
                  {badge}
                </span>
              </>
            )}
          </div>
        </div>
      </Container>
    </header>
  );
};
