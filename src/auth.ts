import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import authConfig from './auth.config';
import { db } from '@/db';
import { appAccess, profiles, userProfiles } from '@/db/schema';

// Auth.js v5 — Credentials(이메일/비번) + JWT. Supabase Auth 대체 (Phase 4).
// authorize는 Node 런타임(라우트핸들러/서버액션)에서만 실행 → DB/bcrypt 사용 OK.
// 스태프(user_profiles)와 파트너(profiles) 둘 다 인증 — 단일 자체호스팅 정체성.
export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? '').trim().toLowerCase();
        const password = String(creds?.password ?? '');
        if (!email || !password) return null;

        // 1) 스태프 (user_profiles) — 비모 ERP
        const staffRows = await db
          .select()
          .from(userProfiles)
          .where(eq(userProfiles.email, email))
          .limit(1);
        const staff = staffRows[0];
        if (staff?.passwordHash) {
          if (!(await bcrypt.compare(password, staff.passwordHash))) return null;
          // 접근 게이트: admin 이거나 승인된 사용자만
          if (staff.role !== 'admin' && staff.approved !== true) return null;
          // ERP 접근(app_access vimo_erp active) — 미들웨어 이중게이트용 JWT 클레임
          const erpRows = await db
            .select({ id: appAccess.id })
            .from(appAccess)
            .where(and(
              eq(appAccess.userId, staff.id),
              eq(appAccess.appCode, 'vimo_erp'),
              eq(appAccess.status, 'active'),
            ))
            .limit(1);
          // 마지막 로그인 시각 갱신 (실패해도 로그인 진행)
          try {
            await db.update(userProfiles).set({ lastLoginAt: new Date().toISOString() }).where(eq(userProfiles.id, staff.id));
          } catch { /* noop */ }
          return {
            id: staff.id,
            email: staff.email ?? email,
            name: staff.name ?? null,
            role: staff.role,
            approved: staff.approved ?? false,
            needsPasswordChange: staff.needsPasswordChange ?? false,
            userType: 'staff',
            erpAccess: erpRows.length > 0,
          };
        }

        // 2) 파트너 (profiles, user_type='partner') — 파트너 서브도메인/앱
        const partnerRows = await db
          .select()
          .from(profiles)
          .where(eq(profiles.email, email))
          .limit(1);
        const partner = partnerRows[0];
        if (partner?.passwordHash && partner.userType === 'partner') {
          if (!(await bcrypt.compare(password, partner.passwordHash))) return null;
          // 파트너는 비모 ERP 게이트 통과 못하게 approved/erpAccess=false (파트너 서브도메인은 미들웨어가 우회)
          return {
            id: partner.id,
            email: partner.email ?? email,
            name: partner.name ?? null,
            role: 'partner',
            approved: false,
            needsPasswordChange: false,
            userType: 'partner',
            erpAccess: false,
          };
        }

        return null;
      },
    }),
  ],
});
