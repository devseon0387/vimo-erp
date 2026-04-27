import { type HTMLAttributes } from 'react';

type Variant = 'surface' | 'subtle' | 'flat';
type Radius = 'md' | 'lg' | 'xl';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  radius?: Radius;
  padded?: boolean | 'sm' | 'md' | 'lg';
}

const BG: Record<Variant, string> = {
  surface: 'bg-white border border-ink-200',
  subtle: 'bg-ink-50 border border-ink-100',
  flat: 'bg-ink-50',
};

const RADIUS: Record<Radius, string> = {
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  xl: 'rounded-[20px]',
};

const PADDING: Record<string, string> = {
  true: 'p-4',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
  false: '',
};

export default function Card({
  variant = 'surface',
  radius = 'lg',
  padded = true,
  className = '',
  ...rest
}: CardProps) {
  const padKey = padded === true || padded === false ? String(padded) : padded;
  return <div className={`${BG[variant]} ${RADIUS[radius]} ${PADDING[padKey]} ${className}`} {...rest} />;
}
