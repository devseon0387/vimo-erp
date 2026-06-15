'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getSessionUser } from '@/lib/auth/session-info';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const u = await getSessionUser();
      router.push(u ? '/management' : '/login');
    };
    checkSession();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f4f2]">
      <div className="flex flex-col items-center gap-4 animate-[fadeInUp_1s_ease]">
        <Image src="/logo.png" alt="비모 ERP" width={72} height={58} priority />
        <span className="text-lg font-bold text-[#1c1917] tracking-tight">비모 ERP</span>
        <div className="flex gap-1.5 mt-3">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-600 animate-[bounce_1.4s_ease-in-out_infinite]" />
          <span className="w-1.5 h-1.5 rounded-full bg-orange-600 animate-[bounce_1.4s_ease-in-out_0.2s_infinite]" />
          <span className="w-1.5 h-1.5 rounded-full bg-orange-600 animate-[bounce_1.4s_ease-in-out_0.4s_infinite]" />
        </div>
      </div>
    </div>
  );
}
