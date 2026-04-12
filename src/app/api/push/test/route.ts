import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getWebPush } from '@/lib/push';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!subs || subs.length === 0) {
    return NextResponse.json({ error: '구독된 기기가 없습니다' }, { status: 404 });
  }

  const webpush = getWebPush();
  const payload = JSON.stringify({
    title: '비모 ERP 테스트 알림',
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
    await supabase.from('push_subscriptions').delete().in('endpoint', stale);
  }

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  return NextResponse.json({ sent, total: subs.length, cleaned: stale.length });
}
