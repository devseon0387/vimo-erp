import { NextResponse } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { pushSubscriptions } from '@/db/schema';
import { createClient } from '@/lib/supabase/server';
import { getWebPush } from '@/lib/push';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let subs: { endpoint: string; p256dh: string; auth: string }[];
  try {
    subs = await db
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256Dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, user.id));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }

  if (!subs || subs.length === 0) {
    return NextResponse.json({ error: '구독된 기기가 없습니다' }, { status: 404 });
  }

  const webpush = getWebPush();
  const payload = JSON.stringify({
    title: '테스트 알림',
    body: '푸시 알림이 정상적으로 동작합니다 🎉',
    url: '/management',
  });

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      )
    )
  );

  const stale: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const err = r.reason as { statusCode?: number };
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        stale.push(subs[i].endpoint);
      }
    }
  });
  if (stale.length) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, stale));
  }

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  return NextResponse.json({ sent, total: subs.length, cleaned: stale.length });
}
