import { redirect } from 'next/navigation';

/**
 * 정산 상세는 finance/settlement/[id]로 통합됨(파트너/매니저 단일 라우트).
 * 기존 경로는 role=manager로 리다이렉트(북마크·외부 링크 보존). year/month 쿼리도 유지.
 */
export default async function ManagerSettlementRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const qs = new URLSearchParams({ role: 'manager' });
  if (typeof sp.year === 'string') qs.set('year', sp.year);
  if (typeof sp.month === 'string') qs.set('month', sp.month);
  redirect(`/finance/settlement/${id}?${qs.toString()}`);
}
