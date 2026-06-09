/**
 * 파트너 가입 신청 DAL 타입 — partner_signups.ts에서 분리.
 * ★ 'use server' DAL은 async 함수만 export 가능 → interface/type은 이 파일로 강등.
 *   호출부(클라이언트 컴포넌트)는 여기서 `import type`으로 가져온다(함수는 DAL에서 그대로).
 */

export interface PendingPartnerSignup {
  profileId: string;        // = auth.users.id (= profiles.id)
  email: string;
  name: string;
  phone: string | null;
  type: 'freelancer' | 'business';
  signupAt: string;          // ISO
}

export interface CreateInviteInput {
  invitedName?: string;
  invitedEmail?: string;
  legacyHintId?: string;
  expiresInDays?: number;
}
