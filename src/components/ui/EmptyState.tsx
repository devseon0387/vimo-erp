import { type ReactNode } from 'react';

interface EmptyStateProps {
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const PADDING = { sm: 'py-6', md: 'py-12', lg: 'py-20' };

export default function EmptyState({ label, description, icon, className = '', size = 'md' }: EmptyStateProps) {
  return (
    <div className={`text-center ${PADDING[size]} ${className}`}>
      {icon && <div className="mx-auto mb-3 text-ink-300 inline-flex">{icon}</div>}
      <p className="text-body font-medium text-ink-500">{label}</p>
      {description && <p className="text-meta mt-1">{description}</p>}
    </div>
  );
}
