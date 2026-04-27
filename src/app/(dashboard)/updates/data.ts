export type ChangeType = 'feat' | 'fix' | 'improve' | 'style';

export interface UpdateEntry {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  tag?: 'latest' | 'major';
  changes: { type: ChangeType; text: string }[];
}

export const erpUpdates: UpdateEntry[] = [
  {
    version: 'v0.2.3',
    date: '2026-04-24',
    title: '회차 마스터-디테일 통합',
    tag: 'latest',
    changes: [
      { type: 'feat', text: '프로젝트 상세 페이지 회차 리스트를 마스터-디테일 패턴으로 전환 — 회차를 클릭하면 우측 패널에 상세가 바로 열려 페이지 왕복 없이 편집 가능' },
      { type: 'improve', text: '회차 간 빠른 전환 — 체크리스트/비용/상태 업데이트 시 맥락 유지' },
      { type: 'improve', text: 'URL 쿼리(?ep=id)로 선택 회차 동기화 — 링크 공유 가능' },
    ],
  },
  {
    version: 'v0.2.1',
    date: '2026-04-06',
    title: '미기입 일괄 처리 & 아카이브 기능',
    changes: [
      { type: 'feat', text: '매니지먼트에 미기입 탭 추가 — 비용·정산일·담당자·일정 일괄 입력' },
      { type: 'feat', text: '프로젝트 아카이브 기능 — v1 노션 데이터 분리' },
      { type: 'fix', text: '파트너 정산 금액에 매니징 비용 합산되던 버그 수정' },
      { type: 'improve', text: '커스텀 달력 모달 (트리플 뷰) 적용' },
      { type: 'style', text: '파트너/매니저 드롭다운 커스텀 디자인' },
    ],
  },
  {
    version: 'v0.2.0',
    date: '2026-03-28',
    title: '대규모 디자인 개편',
    tag: 'major',
    changes: [
      { type: 'feat', text: '정산 상세 페이지 편집 기능 및 이미지 내보내기' },
      { type: 'feat', text: 'PWA 지원 추가 — 모바일 앱처럼 설치 가능' },
      { type: 'feat', text: '지출 관리 + 매니저 정산 디자인 개편' },
      { type: 'improve', text: '매니지먼트 회차 퀵뷰 모달 전면 개편' },
      { type: 'style', text: '로딩 화면 비모 로고로 교체' },
    ],
  },
  {
    version: 'v0.1.6',
    date: '2026-03-20',
    title: '회차별 비용 편수 반영 & 매니저 정산',
    changes: [
      { type: 'feat', text: '회차별 비용에 편수 반영 (단가 × 편수 = 합계)' },
      { type: 'feat', text: '매니저 정산에 작업 비용 항목 추가' },
      { type: 'fix', text: '정산 페이지 2026년 3월 이전 이동 불가 처리' },
    ],
  },
  {
    version: 'v0.1.5',
    date: '2026-03-15',
    title: '체크리스트 디자인 개선',
    changes: [
      { type: 'improve', text: '체크리스트 UI 개선' },
      { type: 'style', text: '숏폼 비용 표시 형식 변경 — 단가 n원 × n편 = 합계' },
    ],
  },
  {
    version: 'v0.1.4',
    date: '2026-03-13',
    title: '파트너/매니저 정산 구현 및 재무 구조 개선',
    changes: [
      { type: 'feat', text: '파트너/매니저 정산 페이지 구현' },
      { type: 'feat', text: '재무 메뉴 구조 개선' },
    ],
  },
];

export const bibotUpdates: UpdateEntry[] = [
  {
    version: 'v1.0.0',
    date: '2026-04-01',
    title: '비봇 초기 릴리즈',
    tag: 'latest',
    changes: [
      { type: 'feat', text: '비봇 MCP 서버 연동' },
      { type: 'feat', text: '에피소드 조회 및 수정 명령어' },
      { type: 'feat', text: '정산 현황 조회 기능' },
    ],
  },
];
