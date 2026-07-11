"use client";

import type { ReactNode } from 'react';
import AdminCard from './AdminCard';
import AdminTooltip from './AdminTooltip';

type AdminFormSectionProps = {
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  headerAction?: ReactNode;
  title?: ReactNode;
  titleTooltip?: string;
};

export default function AdminFormSection({
  children,
  className = '',
  description = '',
  eyebrow = '',
  headerAction = null,
  title = '',
  titleTooltip = '',
}: AdminFormSectionProps) {
  return (
    <AdminCard className={`admin-form-section admin-spotlight ${className}`.trim()} variant="card">
      {eyebrow ? <p className="admin-form-section__eyebrow">{eyebrow}</p> : null}
      {title || headerAction ? (
        <div className="admin-form-section__title-row">
          <div className="admin-form-section__title-group">
            {title ? <h3 className="admin-form-section__title font-headline">{title}</h3> : null}
            {titleTooltip ? <AdminTooltip content={titleTooltip} label="More info" /> : null}
          </div>
          {headerAction}
        </div>
      ) : null}
      {description ? <p className="admin-form-section__description">{description}</p> : null}
      <div className="admin-form-section__body">{children}</div>
    </AdminCard>
  );
}
