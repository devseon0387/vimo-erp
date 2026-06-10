import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { pushSubscriptions } from '@/db/schema';
import { currentUser } from '@/lib/authz';

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { endpoint, keys, userAgent } = body ?? {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }

  // Supabase upsert(onConflict: 'endpoint') 1:1 재현.
  // 충돌 시 제공한 컬럼 전체 덮어쓰기(user_id/p256dh/auth/user_agent).
  try {
    await db
      .insert(pushSubscriptions)
      .values({
        userId: user.id,
        endpoint,
        p256Dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent ?? null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: user.id,
          p256Dh: keys.p256dh,
          auth: keys.auth,
          userAgent: userAgent ?? null,
        },
      });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { endpoint } = await req.json();
  if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 });

  try {
    await db
      .delete(pushSubscriptions)
      .where(and(
        eq(pushSubscriptions.userId, user.id),
        eq(pushSubscriptions.endpoint, endpoint),
      ));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
