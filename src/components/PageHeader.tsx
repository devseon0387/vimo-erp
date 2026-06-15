import React from 'react';

/**
 * 공용 페이지 헤더 — 제목(text-page 20px) + 부제(text-caption) + 우측 액션.
 * 페이지마다 text-3xl/2xl/page로 제각각이던 H1을 한 컴포넌트로 통일.
 *   <PageHeader title="프로젝트" subtitle="전체 24 · 진행 11" action={<button>새 프로젝트</button>} />
 */
export function PageHeader({
  title,
  subtitle,
  action,
  className = '',
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 flex-wrap ${className}`}>
      <div className="min-w-0">
        <h1 className="text-page">{title}</h1>
        {subtitle != null && subtitle !== '' && (
          <p className="text-caption mt-1">{subtitle}</p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
