import type { NextAuthConfig } from 'next-auth';

// Edge-안전 기본 설정 — DB/bcrypt 등 Node 전용 코드 없음.
// 미들웨어(proxy.ts)와 auth.ts가 공유. 실제 Credentials provider(authorize=DB)는 auth.ts에서 주입.
export default {
  pages: { signIn: '/login' },
  // JWT 1일 — 미들웨어는 클레임만 보므로 계정 상태 변경(승인취소 등)의 staleness 상한.
  // DAL의 라이브 권한검증(authz.ts isVimoAdmin/hasErpAccess 등)이 즉시 차단을 담당.
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 },
  providers: [], // auth.ts에서 채움
  callbacks: {
    // 로그인 시 authorize()가 돌려준 user를 JWT claim으로 적재 (미들웨어가 DB 없이 게이트 판단)
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = (user as { role?: string }).role ?? 'manager';
        token.approved = (user as { approved?: boolean }).approved ?? false;
        token.needsPasswordChange = (user as { needsPasswordChange?: boolean }).needsPasswordChange ?? false;
        token.userType = (user as { userType?: string }).userType ?? 'staff';
        token.erpAccess = (user as { erpAccess?: boolean }).erpAccess ?? false;
        token.name = user.name ?? null;
      }
      // 비번 변경 직후 등 서버 측 unstable_update() 호출 시 클레임 갱신
      // (전달 형태가 {user:{...}} 또는 평탄 객체 둘 다 허용)
      if (trigger === 'update' && session) {
        const raw = session as Record<string, unknown>;
        const patch = (raw.user ?? raw) as Partial<{ needsPasswordChange: boolean; name: string }>;
        if (typeof patch.needsPasswordChange === 'boolean') token.needsPasswordChange = patch.needsPasswordChange;
        if (typeof patch.name === 'string') token.name = patch.name;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? '';
        session.user.role = (token.role as string) ?? 'manager';
        session.user.approved = (token.approved as boolean) ?? false;
        session.user.needsPasswordChange = (token.needsPasswordChange as boolean) ?? false;
        session.user.userType = (token.userType as string) ?? 'staff';
        session.user.erpAccess = (token.erpAccess as boolean) ?? false;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
