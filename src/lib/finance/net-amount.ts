/**
 * 정산 실 수령액(net) 계산 — 파트너 정산·매니저 정산 상세가 '동일 기준'으로 쓰는 단일 출처.
 *
 * 이전에는 partner-settlement/[id] 와 manager-settlement/[id] 가 각자 calcNetAmount 를 정의했고,
 * partnerType 미설정 시 동작이 달랐다(파트너 화면=원금, 매니저 화면=3.3% 차감). 같은 사람의 실 지급액·
 * 내보내기 정산서 금액이 화면에 따라 달라져 송금 오류·원천세 신고 근거 흔들림 위험이 있었다.
 *
 * 통일 기준:
 *  - business(사업자): 부가세 10% 가산 (×1.1)
 *  - freelancer(프리랜서): 원천징수 3.3% 차감 (×0.967)
 *  - 미설정: 원금 유지(차감/가산 없음) + 라벨 '세율 미설정' — 송금 전 유형 지정을 유도(잘못된 자동 차감 방지).
 */
export type PartnerTaxType = 'freelancer' | 'business';

export function calcNetAmount(amount: number, partnerType?: PartnerTaxType): number {
  if (partnerType === 'business') return Math.round(amount * 1.1);
  if (partnerType === 'freelancer') return Math.round(amount * (1 - 0.033));
  return amount;
}

export function getNetLabel(partnerType?: PartnerTaxType): string {
  if (partnerType === 'business') return '부가세 10%';
  if (partnerType === 'freelancer') return '3.3%';
  return '세율 미설정';
}
