import React from 'react';

const baseCardClass = 'rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-primary)] shadow-sm';

export const cardClassName = baseCardClass;

interface SectionCardProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export const SectionCard: React.FC<SectionCardProps> = ({ title, description, action, className = '', children }) => {
  return (
    <section className={`${baseCardClass} p-6 ${className}`.trim()}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
          {description && <p className="mt-1 text-sm text-[var(--text-tertiary)] leading-6">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
};

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, hint }) => {
  return (
    <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4">
      <div className="text-xs uppercase tracking-[0.24em] text-[var(--text-tertiary)]">{label}</div>
      <div className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{value}</div>
      {hint && <div className="mt-2 text-sm text-[var(--text-tertiary)] leading-6">{hint}</div>}
    </div>
  );
};

interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action }) => {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border-primary)] bg-[var(--bg-secondary)] px-6 py-10 text-center">
      <div className="text-base font-semibold text-[var(--text-primary)]">{title}</div>
      <div className="mt-2 text-sm text-[var(--text-tertiary)] leading-6">{description}</div>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
};
