/**
 * 휴지통 유틸리티 (Supabase 기반)
 * 기존 localStorage API와 동일한 함수 시그니처 유지 (async로 변경)
 */
import {
  getTrash,
  insertTrash,
  deleteTrashItem,
  permanentDeleteTrash,
  emptyTrashAll,
  cleanupExpiredTrashItems,
} from './supabase/db';
import type { TrashItem, TrashItemType, Project, Episode, Client, Partner } from '@/types';

/**
 * 휴지통에서 항목 가져오기
 */
export async function getTrashItems(): Promise<TrashItem[]> {
  return getTrash();
}

/**
 * 휴지통에 항목 추가
 */
export async function addToTrash(
  type: TrashItemType,
  data: Project | Episode | Client | Partner,
  originalProjectId?: string
): Promise<boolean> {
  // 휴지통 백업 성공 여부 반환 — 삭제 전 백업 확인용(insertTrash 는 실패 시 null)
  const saved = await insertTrash(type, data, originalProjectId);
  return saved !== null;
}

/**
 * 휴지통에서 항목 복구 (휴지통에서 제거하고 데이터 반환)
 */
export async function restoreFromTrash(trashItemId: string): Promise<TrashItem | null> {
  return deleteTrashItem(trashItemId);
}

/**
 * 휴지통에서 항목 영구 삭제
 */
export async function permanentlyDelete(trashItemId: string): Promise<boolean> {
  return permanentDeleteTrash(trashItemId);
}

/**
 * 30일 지난 항목 자동 삭제
 */
export async function cleanupExpiredTrash(): Promise<number> {
  return cleanupExpiredTrashItems(30);
}

/**
 * 휴지통 비우기 (모든 항목 영구 삭제)
 */
export async function emptyTrash(): Promise<number> {
  const items = await getTrash();
  const count = items.length;
  await emptyTrashAll();
  return count;
}

/**
 * 항목이 삭제된 지 며칠 지났는지 계산
 */
export function getDaysInTrash(deletedAt: string): number {
  const deletedDate = new Date(deletedAt);
  const now = new Date();
  const diffMs = now.getTime() - deletedDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * 항목이 만료되기까지 남은 일수
 */
export function getDaysUntilExpiry(deletedAt: string): number {
  const daysInTrash = getDaysInTrash(deletedAt);
  return Math.max(0, 30 - daysInTrash);
}
