/**
 * 계약 공용 메타 — 상태/유형 라벨·톤, 금액 포맷, D-day 등 목록·상세 공유.
 *  계약 상태(6단계): draft 초안 → sent 발송 → signed 서명 → active 진행중 → completed 완료 / cancelled 취소
 *  금액: supplyAmount(공급가액) → vatAmount(10%) → totalAmount(합계). 면세 시 vat 수정 가능.
 */
import type { Contract, ContractStatus, ContractType } from '@/types';
import type { StatusTone as BadgeTone } from '@/components/StatusBadge';

export const won = (n: number) => Math.round(n || 0).toLocaleString('ko-KR');
export const todayStr = () => new Date().toISOString().slice(0, 10);

/** YYYY-MM-DD → YY.MM.DD (없으면 '미정') */
export const shortDate = (d?: string) => (d ? d.slice(2).replace(/-/g, '.') : '미정');
/** YYYY-MM-DD → YYYY.MM.DD */
export const longDate = (d?: string) => (d ? d.replace(/-/g, '.') : '미정');

/** 종료일까지 남은 일수(음수면 지남). 없으면 null */
export function daysUntil(end?: string): number | null {
  if (!end) return null;
  return Math.ceil((new Date(end).getTime() - Date.now()) / 86400000);
}

export const STATUS_META: Record<ContractStatus, { label: string; tone: BadgeTone; dot?: boolean }> = {
  draft: { label: '초안', tone: 'neutral' },
  sent: { label: '발송', tone: 'info' },
  signed: { label: '서명완료', tone: 'brand' },
  active: { label: '진행중', tone: 'ok', dot: true },
  completed: { label: '완료', tone: 'neutral' },
  cancelled: { label: '해지', tone: 'danger' },
};

export const TYPE_LABEL: Record<ContractType, string> = {
  single: '단건',
  annual: '연간',
  retainer: '리테이너',
};

/** 타임라인 6단계(취소 제외 5 + 해지는 별도) */
export const TIMELINE: { key: ContractStatus; label: string }[] = [
  { key: 'draft', label: '초안 작성' },
  { key: 'sent', label: '계약서 발송' },
  { key: 'signed', label: '서명 완료' },
  { key: 'active', label: '진행중' },
  { key: 'completed', label: '완료' },
];

const ORDER: ContractStatus[] = ['draft', 'sent', 'signed', 'active', 'completed'];
/** 타임라인 단계 상태: done(지남) / cur(현재) / todo(앞으로) */
export function stageState(step: ContractStatus, current: ContractStatus): 'done' | 'cur' | 'todo' {
  if (current === 'cancelled') return ORDER.indexOf(step) <= ORDER.indexOf('draft') ? 'done' : 'todo';
  const ci = ORDER.indexOf(current);
  const si = ORDER.indexOf(step);
  if (si < ci) return 'done';
  if (si === ci) return 'cur';
  return 'todo';
}

export type ContractTone = BadgeTone;

/** 만료 임박 경고 대상: active/signed + 종료일 30일 이내(지나지 않음) */
export function isExpiringSoon(c: Contract): boolean {
  if (c.status !== 'active' && c.status !== 'signed') return false;
  const d = daysUntil(c.endDate);
  return d !== null && d >= 0 && d <= 30;
}

/** 당월(YYYY-MM) 여부 */
export function isThisMonth(d?: string): boolean {
  if (!d) return false;
  return d.slice(0, 7) === todayStr().slice(0, 7);
}
