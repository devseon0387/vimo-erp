import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';

/**
 * 기존 에피소드들의 budget_partner / budget_management를 올바르게 재계산합니다.
 * 버그: 모든 작업 타입에 step count를 곱했음 → 숏폼만 곱해야 함
 */
export async function POST() {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
    const { admin: adminSupabase } = guard;

    // 모든 에피소드 가져오기
    const { data: episodes, error } = await adminSupabase
      .from('episodes')
      .select('id, work_content, work_budgets, work_steps, budget_total, budget_partner, budget_management');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!episodes) return NextResponse.json({ fixed: 0, message: '에피소드 없음' });

    type WorkBudgets = Record<string, { partnerPayment: number; managementFee: number }>;
    type WorkSteps = Record<string, unknown[]>;

    let fixedCount = 0;
    const details: { id: string; before: { partner: number; management: number }; after: { partner: number; management: number } }[] = [];

    for (const ep of episodes) {
      const workContent = (ep.work_content as string[]) || [];
      const workBudgets = (ep.work_budgets as WorkBudgets) || {};
      const workSteps = (ep.work_steps as WorkSteps) || {};

      if (workContent.length === 0 || Object.keys(workBudgets).length === 0) continue;

      // 올바른 계산: 숏폼만 편수 곱하기
      const stepCount = (wt: string) =>
        (wt === '기획 숏폼' || wt === '본편 숏폼')
          ? Math.max(1, (workSteps[wt] || []).length)
          : 1;

      // OAP는 work_content에 포함 여부와 무관하게 항상 포함
      const allTypes = [...new Set([...workContent, 'OAP'])];

      const correctPartner = allTypes.reduce(
        (sum, wt) => sum + (workBudgets[wt]?.partnerPayment || 0) * stepCount(wt), 0
      );
      const correctManagement = allTypes.reduce(
        (sum, wt) => sum + (workBudgets[wt]?.managementFee || 0) * stepCount(wt), 0
      );

      // 값이 다르면 업데이트
      if (ep.budget_partner !== correctPartner || ep.budget_management !== correctManagement) {
        details.push({
          id: ep.id,
          before: { partner: ep.budget_partner, management: ep.budget_management },
          after: { partner: correctPartner, management: correctManagement },
        });

        const { error: updateError } = await adminSupabase
          .from('episodes')
          .update({
            budget_partner: correctPartner,
            budget_management: correctManagement,
          })
          .eq('id', ep.id);

        if (!updateError) fixedCount++;
      }
    }

    return NextResponse.json({
      total: episodes.length,
      fixed: fixedCount,
      details,
    });
  } catch (err) {
    return NextResponse.json({ error: '서버 내부 오류: ' + String(err) }, { status: 500 });
  }
}
