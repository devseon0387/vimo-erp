import 'next-auth';

// Auth.js 세션/유저 타입 증강 — 비모 ERP 권한 클레임
declare module 'next-auth' {
  interface User {
    role?: string;
    approved?: boolean;
    needsPasswordChange?: boolean;
    userType?: string;
    erpAccess?: boolean;
  }
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      role: string;
      approved: boolean;
      needsPasswordChange: boolean;
      userType: string;
      erpAccess: boolean;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: string;
    approved?: boolean;
    needsPasswordChange?: boolean;
    userType?: string;
    erpAccess?: boolean;
  }
}
