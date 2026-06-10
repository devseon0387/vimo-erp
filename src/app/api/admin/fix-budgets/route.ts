import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/admin';
import { db } from '@/db';
import { episodes } from '@/db/schema';

/**
 * 기존 에피소드들의 budget_partner / budget_management를 올바르게 재계산합니다.
 * 버그: 모든 작업 타입에 step count를 곱했음 → 숏폼만 곱해야 함
 * (Drizzle 전환 — 자체호스팅 PG. numeric은 문자열이라 Number 변환.)
 */
export async function POST() {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const rows = await db
      .select({
        id: episodes.id,
        workContent: episodes.workContent,
        workBudgets: episodes.workBudgets,
        workSteps: episodes.workSteps,
        budgetPartner: episodes.budgetPartner,
        budgetManagement: episodes.budgetManagement,
      })
      .from(episodes);

    type WorkBudgets = Record<string, { partnerPayment: number; managementFee: number }>;
    type WorkSteps = Record<string, unknown[]>;

    let fixedCount = 0;
    const details: { id: string; before: { partner: number; management: number }; after: { partner: number; management: number } }[] = [];

    for (const ep of rows) {
      const workContent = (ep.workContent as string[]) || [];
      const workBudgets = (ep.workBudgets as WorkBudgets) || {};
      const workSteps = (ep.workSteps as WorkSteps) || {};

      if (workContent.length === 0 || Object.keys(workBudgets).length === 0) continue;

      // 올바른 계산: 숏폼만 편수 곱하기
      const stepCount = (wt: string) =>
        (wt === '기획 숏폼' || wt === '본편 숏폼')
          ? Math.max(1, (workSteps[wt] || []).length)
          : 1;

      // OAP는 work_content 포함 여부와 무관하게 항상 포함
      const allTypes = [...new Set([...workContent, 'OAP'])];

      const correctPartner = allTypes.reduce(
        (sum, wt) => sum + (workBudgets[wt]?.partnerPayment || 0) * stepCount(wt), 0,
      );
      const correctManagement = allTypes.reduce(
        (sum, wt) => sum + (workBudgets[wt]?.managementFee || 0) * stepCount(wt), 0,
      );

      const curPartner = Number(ep.budgetPartner ?? 0);
      const curManagement = Number(ep.budgetManagement ?? 0);

      if (curPartner !== correctPartner || curManagement !== correctManagement) {
        details.push({
          id: ep.id,
          before: { partner: curPartner, management: curManagement },
          after: { partner: correctPartner, management: correctManagement },
        });

        try {
          await db
            .update(episodes)
            .set({ budgetPartner: String(correctPartner), budgetManagement: String(correctManagement) })
            .where(eq(episodes.id, ep.id));
          fixedCount++;
        } catch { /* 개별 실패는 건너뜀 */ }
      }
    }

    return NextResponse.json({ total: rows.length, fixed: fixedCount, details });
  } catch (err) {
    return NextResponse.json({ error: '서버 내부 오류: ' + String(err) }, { status: 500 });
  }
}
