// 사용자 권한 타입
export type UserRole = 'admin' | 'partner';

// 파트너 타입
export interface Partner {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  partnerType?: 'freelancer' | 'business'; // 프리랜서 / 사업자
  role: UserRole;
  position?: 'executive' | 'manager' | 'partner'; // 직급 분류 (임원진/매니저/파트너)
  jobTitle?: string; // 직책 (대표이사, 팀장 등)
  jobRank?: string; // 직급 (이사, 부장, 과장 등)
  status: 'active' | 'inactive';
  generation?: number; // 파트너 기수 (1기, 2기, 3기...)
  bank?: string; // 은행명
  bankAccount?: string; // 계좌번호
  createdAt: string;
  profileImage?: string;
  kakaoChatId?: string; // 카카오톡 톡방 ID (비봇 파트너 모니터링/알림용)
}

// 프로젝트 상태
export type ProjectStatus = 'planning' | 'in_progress' | 'completed' | 'on_hold' | 'archived';

// 프로젝트 비용 정보
export interface ProjectBudget {
  totalAmount: number; // 전체 프로젝트 비용 (클라이언트로부터 받는 총 금액)
  partnerPayment: number; // 파트너 지급 비용
  managementFee: number; // 매니징 비용
  marginRate: number; // 마진율 (%)
}

// 프로젝트 타입
export interface Project {
  id: string;
  title: string;
  description: string;
  client: string;
  clientId?: string; // 클라이언트 FK (client_id)
  partnerId: string; // 담당 파트너 (첫 번째 파트너 / 하위 호환용)
  partnerIds: string[]; // 담당 파트너 목록 (복수)
  managerIds: string[]; // 매니저 목록
  category?: string; // 프로젝트 카테고리
  channels?: string[]; // 상영 채널 (복수 선택)
  status: ProjectStatus;
  budget: ProjectBudget; // 비용 정보
  workContent?: WorkContentType[]; // 작업 내용 (복수 선택 가능)
  thumbnailUrl?: string;
  videoUrl?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  workTypeCosts?: { [key in WorkContentType]?: { partnerCost: number; managementCost: number } }; // 작업별 비용 정보
  totalAmount?: number; // 전체 금액
}

// 회차 상태
export type EpisodeStatus = 'waiting' | 'in_progress' | 'review' | 'completed';

// 작업 내용 타입
export type WorkContentType = '롱폼' | '기획 숏폼' | '본편 숏폼' | '썸네일' | 'OAP';

// 작업 항목 상세 타입
export interface EpisodeWorkItem {
  type: WorkContentType;
  startDate?: string;
  endDate?: string;
  dueDate?: string;
  status: 'waiting' | 'in_progress' | 'completed';
}

// 회차별 비용 정보
export interface EpisodeBudget {
  totalAmount: number; // 회차 총 비용
  partnerPayment: number; // 파트너 지급액
  managementFee: number; // 매니징 비용
}

// 작업 단계 타입
export interface WorkStep {
  id: string;
  label: string;
  category?: string;
  status: 'waiting' | 'in_progress' | 'completed';
  startDate: string;
  dueDate: string;
  assigneeId?: string;
}

// 작업 타입별 비용
export interface WorkTypeBudget {
  partnerPayment: number;
  managementFee: number;
}

// 회차 타입
export interface Episode {
  id: string;
  episodeNumber: number; // 회차 번호 (1, 2, 3...)
  title: string; // 회차 이름
  description?: string; // 회차 설명
  client?: string; // 클라이언트 이름
  clientId?: string; // 클라이언트 FK (client_id)
  workContent: WorkContentType[]; // 작업 내용 (복수 선택 가능)
  workItems?: EpisodeWorkItem[]; // 작업 항목별 상세 정보
  status: EpisodeStatus; // 진행사항
  assignee: string; // 담당자 ID (파트너)
  manager: string; // 매니저 ID
  startDate: string; // 작업 시작일
  endDate?: string; // 작업 종료일
  dueDate?: string; // 마감일
  budget?: EpisodeBudget; // 회차별 비용 정보
  workSteps?: Record<WorkContentType, WorkStep[]>; // 작업 타입별 상세 작업 단계
  workBudgets?: Record<WorkContentType, WorkTypeBudget>; // 작업 타입별 비용 정보
  paymentDueDate?: string; // 입금 예정일
  paymentStatus?: 'pending' | 'completed'; // 입금 상태 (pending: 입금 전, completed: 입금 완료)
  invoiceDate?: string; // 세금계산서 발행일
  invoiceStatus?: 'pending' | 'completed'; // 발행 상태 (pending: 미발행, completed: 발행 완료)
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// 지출 카테고리
export type ExpenseCategory = '운영비' | '장비' | '교통' | '식비' | '숙박' | '소프트웨어' | '기타';

// 결제 유형
export type PaymentType = 'one_time' | 'monthly' | 'yearly';

// 구독 상태
export type SubscriptionStatus = 'active' | 'cancelling' | 'cancelled';

// 지출 타입
export interface Expense {
  id: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  paymentType: PaymentType;
  expenseDate: string;
  nextRenewalDate?: string;
  status: SubscriptionStatus;
  cancelReason?: string;
  description?: string;
  spenderName?: string;
  createdAt: string;
  updatedAt: string;
}

// 클라이언트 타입
export interface Client {
  id: string;
  name: string; // 클라이언트 이름/회사명
  contactPerson?: string; // 담당자 이름
  email?: string;
  phone?: string;
  company?: string; // 회사명
  address?: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
  notes?: string; // 메모
}

// 포트폴리오 항목 타입
export interface PortfolioItem {
  id: string;
  title: string;
  description: string;
  client: string;
  partnerId?: string;
  category?: string;
  displayOrder?: number;
  completedAt: string;
  tags: string[];
  youtubeUrl: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

// 문의 상태
export type InquiryStatus = 'new' | 'contacted' | 'in_progress' | 'completed' | 'rejected';

// 문의 타입
export interface Inquiry {
  id: string;
  name: string;
  email?: string;
  phone: string;
  projectType: string;
  budget?: string;
  message: string;
  referencesLinks: string[];
  portfolioReferences: (string | { id: string; title: string; category: string; client: string })[];
  referralSource?: string;
  status: InquiryStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// 개선사항(피드백) 타입
export type FeedbackStatus = 'pending' | 'reviewed' | 'done';

export interface Feedback {
  id: string;
  content: string;
  pagePath: string;
  status: FeedbackStatus;
  createdAt: string;
}

// 보낸 메일 타입
export interface SentEmail {
  id: string;
  senderEmail: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  content: string;
  status: 'sent';
  createdAt: string;
}

// 휴지통 항목 타입
export type TrashItemType = 'project' | 'episode' | 'client' | 'partner';

export interface TrashItem {
  id: string; // 휴지통 항목 자체의 ID
  type: TrashItemType; // 삭제된 항목의 타입
  data: Project | Episode | Client | Partner; // 원본 데이터
  deletedAt: string; // 삭제 시간
  originalProjectId?: string; // 회차의 경우 원래 소속된 프로젝트 ID
}
