import { type ReactNode } from 'react';

type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'bad' | 'info';
type Size = 'xs' | 'sm';

interface ChipProps {
  tone?: Tone;
  size?: Size;
  children: ReactNode;
  className?: string;
}

const TONES: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-600',
  brand:   'bg-brand-50 text-brand-600',
  ok:      'bg-ok-50 text-ok-600',
  warn:    'bg-warn-50 text-warn-700',
  bad:     'bg-bad-100 text-bad-700',
  info:    'bg-blue-50 text-blue-600',
};

const SIZES: Record<Size, string> = {
  xs: 'text-[10px] px-1.5 py-0.5 rounded-md',
  sm: 'text-[11px] px-2 py-0.5 rounded-md',
};

export default function Chip({ tone = 'neutral', size = 'sm', children, className = '' }: ChipProps) {
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${TONES[tone]} ${SIZES[size]} ${className}`}>
      {children}
    </span>
  );
}
