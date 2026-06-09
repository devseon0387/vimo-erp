/**
 * app_access DAL 공용 타입 — Phase 2 타입 분리.
 * ★ 'use server' DAL(app_access.ts)에서는 async 함수만 export 가능하므로
 *   interface/type 선언을 이 파일로 분리한다. (배럴 미경유 — 직접 import)
 */

export type AppCode = 'vimo_erp' | 'partner_erp' | 'vibox';
export type AccessStatus = 'active' | 'suspended';

export interface UserWithAccess {
  userId: string;
  name: string;
  email: string;
  userType: string | null;       // profiles.user_type ('staff' | 'partner' | null)
  access: Record<AppCode, AccessStatus | null>;
}
