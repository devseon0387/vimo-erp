import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { ProjectBudget, Episode } from "@/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 유보금 계산 함수
export function calculateReserve(budget: ProjectBudget): number {
  return budget.totalAmount - budget.partnerPayment - budget.managementFee;
}

// 전화번호 포맷 (숫자만 추출 후 하이픈 자동 삽입)
export function formatPhoneNumber(value: string | undefined): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

// 날짜 포맷 함수
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// 자동 계산 프로젝트 상태
export type ComputedProjectStatus = 'active' | 'standby' | 'dormant' | 'inactive';

export function getComputedProjectStatus(
  projectEpisodes: Episode[]
): ComputedProjectStatus {
  if (projectEpisodes.length === 0) return 'inactive';

  const hasNonCompleted = projectEpisodes.some(ep => ep.status !== 'completed');
  if (hasNonCompleted) return 'active';

  // 모두 완료 → completedAt 최대값 기준
  const completedDates = projectEpisodes
    .map(ep => ep.completedAt)
    .filter((d): d is string => !!d)
    .map(d => new Date(d).getTime());

  if (completedDates.length === 0) return 'inactive';

  const lastCompletedAt = Math.max(...completedDates);
  const daysSince = (Date.now() - lastCompletedAt) / (1000 * 60 * 60 * 24);

  if (daysSince < 14) return 'standby';
  if (daysSince < 28) return 'dormant';
  return 'inactive';
}

// 상태 우선순위 (active가 가장 먼저)
const STATUS_PRIORITY: Record<ComputedProjectStatus, number> = {
  active: 0, standby: 1, dormant: 2, inactive: 3,
};

// 프로젝트 정렬: 상태 우선순위 비교 후, 같은 그룹 내 일정순
export function compareProjects(
  aEpisodes: Episode[], aStatus: ComputedProjectStatus,
  bEpisodes: Episode[], bStatus: ComputedProjectStatus,
): number {
  // 1. 상태 그룹 우선순위
  const priorityDiff = STATUS_PRIORITY[aStatus] - STATUS_PRIORITY[bStatus];
  if (priorityDiff !== 0) return priorityDiff;

  // 2. 같은 그룹 내 정렬
  if (aStatus === 'active') {
    // 가장 가까운 미완료 에피소드 dueDate 오름차순
    const aDue = getEarliestDueDate(aEpisodes);
    const bDue = getEarliestDueDate(bEpisodes);
    return aDue - bDue;
  }
  // standby/dormant/inactive: 마지막 completedAt 내림차순 (최신 먼저)
  const aCompleted = getLatestCompletedAt(aEpisodes);
  const bCompleted = getLatestCompletedAt(bEpisodes);
  return bCompleted - aCompleted;
}

function getEarliestDueDate(episodes: Episode[]): number {
  const dueDates = episodes
    .filter(ep => ep.status !== 'completed' && ep.dueDate)
    .map(ep => new Date(ep.dueDate!).getTime());
  return dueDates.length > 0 ? Math.min(...dueDates) : Infinity;
}

function getLatestCompletedAt(episodes: Episode[]): number {
  const dates = episodes
    .map(ep => ep.completedAt)
    .filter((d): d is string => !!d)
    .map(d => new Date(d).getTime());
  return dates.length > 0 ? Math.max(...dates) : 0;
}
