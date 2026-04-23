'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

interface NavItemProps {
  href: string;
  icon: ReactNode;
  children: ReactNode;
  onClick?: () => void;
}

export default function NavItem({ href, icon, children, onClick }: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + '/');

  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 py-2.5 pr-3 pl-4 rounded-r-xl transition-all duration-200 relative"
      style={
        isActive
          ? {
              borderLeft: '3px solid #f97316',
              background: 'rgba(249,115,22,0.07)',
              color: '#f97316',
              fontWeight: 600,
              marginLeft: 0,
            }
          : {
              borderLeft: '3px solid transparent',
              color: '#78716c',
              marginLeft: 0,
            }
      }
      onMouseEnter={e => {
        if (!isActive) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.5)';
          e.currentTarget.style.color = '#1c1917';
        }
      }}
      onMouseLeave={e => {
        if (!isActive) {
          e.currentTarget.style.background = '';
          e.currentTarget.style.color = '#78716c';
        }
      }}
    >
      <span style={{ opacity: isActive ? 1 : 0.7 }}>{icon}</span>
      <span className="text-sm font-medium">{children}</span>
    </Link>
  );
}
