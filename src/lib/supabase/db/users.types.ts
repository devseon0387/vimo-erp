/**
 * users DAL 공유 타입 — 'use server' 모듈은 타입을 export 할 수 없으므로 분리.
 * (ChecklistRow는 ManagementMain.tsx 등 클라이언트 컴포넌트에서 import type 으로 사용.)
 */
export interface ChecklistRow {
  id: string;
  user_id: string;
  text: string;
  completed: boolean;
  reminder_time: string | null;
  notified: boolean;
  repeat_type: string | null;
  repeat_days: number[] | null;
  linked_episode_id: string | null;
  linked_episode_title: string | null;
  linked_episode_number: number | null;
  linked_project_id: string | null;
  linked_project_title: string | null;
  linked_client_name: string | null;
  linked_partner_id: string | null;
  linked_partner_name: string | null;
  created_at: string;
}
