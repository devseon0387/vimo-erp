// 입금 관리 → 매출 관리(청구·수금 통합)로 이전. 옛 경로는 리다이렉트.
import { redirect } from 'next/navigation';

export default function PaymentsRedirect() {
  redirect('/finance/revenue');
}
