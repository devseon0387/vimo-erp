'use client';

import { useState, useEffect } from 'react';
import {
  Bot, Clock, CheckCircle2, AlertCircle, RefreshCw,
  Zap, MessageSquare, Search, Shield, TrendingUp,
  Coffee, Sun, Sunset, Moon,
} from 'lucide-react';

// ── 타입 정의
interface ScheduledTask {
  id: string;
  name: string;
  schedule: string;
  time: string;
  icon: React.ElementType;
  description: string;
  status: 'active' | 'paused';
  category: 'monitoring' | 'report' | 'alert' | 'analysis';
}

// ── 비봇 예약 작업 목록
const SCHEDULED_TASKS: ScheduledTask[] = [
  {
    id: 'morning-briefing',
    name: '오전 브리핑',
    schedule: '매일',
    time: '08:00',
    icon: Coffee,
    description: '날씨, 오늘 전달 일정, 릴리즈 알림을 운영 카톡방에 전송',
    status: 'active',
    category: 'report',
  },
  {
    id: 'job-check',
    name: '일감 확인',
    schedule: '평일',
    time: '08:10',
    icon: Search,
    description: '크롤링으로 새 일감을 확인하고 결과 보고',
    status: 'active',
    category: 'monitoring',
  },
  {
    id: 'kakao-morning',
    name: '파트너 카톡 모니터링 (오전)',
    schedule: '평일',
    time: '09:00',
    icon: MessageSquare,
    description: '파트너 소통방 확인 → 변동사항 있으면 ERP 반영 + 보고',
    status: 'active',
    category: 'monitoring',
  },
  {
    id: 'erp-monitor',
    name: 'ERP 이상 감지',
    schedule: '평일',
    time: '10:00',
    icon: Shield,
    description: 'ERP 데이터 이상 여부 점검, 이상 시 보고',
    status: 'active',
    category: 'alert',
  },
  {
    id: 'kakao-afternoon',
    name: '파트너 카톡 모니터링 (오후)',
    schedule: '평일',
    time: '13:00',
    icon: MessageSquare,
    description: '오전 이후 파트너 소통방 변동사항 확인',
    status: 'active',
    category: 'monitoring',
  },
  {
    id: 'deadline-alert',
    name: '내일 마감 알림',
    schedule: '매일',
    time: '16:00',
    icon: AlertCircle,
    description: '내일 전달할 프로젝트를 운영 카톡방에 전송',
    status: 'active',
    category: 'alert',
  },
  {
    id: 'weekly-insight',
    name: '주간 운영 인사이트',
    schedule: '금요일',
    time: '17:00',
    icon: TrendingUp,
    description: '주간 운영 데이터 분석 및 인사이트 보고',
    status: 'active',
    category: 'analysis',
  },
  {
    id: 'kakao-closing',
    name: '파트너 카톡 모니터링 (마감)',
    schedule: '평일',
    time: '17:30',
    icon: MessageSquare,
    description: '당일 소통 종합 정리, 변동 유무와 관계없이 보고',
    status: 'active',
    category: 'monitoring',
  },
  {
    id: 'daily-health',
    name: '일일 자가진단',
    schedule: '매일',
    time: '21:00',
    icon: CheckCircle2,
    description: '비봇 작업 수행 현황 자가 점검 및 보고',
    status: 'active',
    category: 'report',
  },
];

// ── 카테고리 스타일
const CATEGORY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  monitoring: { bg: '#dbeafe', text: '#1e40af', label: '모니터링' },
  report:     { bg: '#dcfce7', text: '#166534', label: '보고' },
  alert:      { bg: '#fef9c3', text: '#854d0e', label: '알림' },
  analysis:   { bg: '#f3e8ff', text: '#6b21a8', label: '분석' },
};

// ── 현재 시간대에 따른 아이콘
function getTimeIcon() {
  const h = new Date().getHours();
  if (h < 9) return Sun;
  if (h < 13) return Coffee;
  if (h < 18) return Sunset;
  return Moon;
}

// ── 다음 예약 작업 계산
function getNextTask(): ScheduledTask | null {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const day = now.getDay();
  const isWeekday = day >= 1 && day <= 5;
  const isFriday = day === 5;

  for (const task of SCHEDULED_TASKS) {
    const [h, m] = task.time.split(':').map(Number);
    const taskMinutes = h * 60 + m;
    if (taskMinutes <= currentMinutes) continue;
    if (task.schedule === '평일' && !isWeekday) continue;
    if (task.schedule === '금요일' && !isFriday) continue;
    return task;
  }
  return SCHEDULED_TASKS[0];
}

// ── 완료된 작업 수 계산
function getCompletedCount(): number {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const day = now.getDay();
  const isWeekday = day >= 1 && day <= 5;
  const isFriday = day === 5;

  return SCHEDULED_TASKS.filter(task => {
    const [h, m] = task.time.split(':').map(Number);
    const taskMinutes = h * 60 + m;
    if (taskMinutes > currentMinutes) return false;
    if (task.schedule === '평일' && !isWeekday) return false;
    if (task.schedule === '금요일' && !isFriday) return false;
    return true;
  }).length;
}

// ── 오늘 총 예정 작업 수
function getTodayTotalCount(): number {
  const day = new Date().getDay();
  const isWeekday = day >= 1 && day <= 5;
  const isFriday = day === 5;

  return SCHEDULED_TASKS.filter(task => {
    if (task.schedule === '매일') return true;
    if (task.schedule === '평일' && isWeekday) return true;
    if (task.schedule === '금요일' && isFriday) return true;
    return false;
  }).length;
}

export default function VbotManagementPage() {
  const [currentTime, setCurrentTime] = useState(new Date());

  // 시간 업데이트 (1분마다)
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const nextTask = getNextTask();
  const completedCount = getCompletedCount();
  const todayTotal = getTodayTotalCount();
  const TimeIcon = getTimeIcon();
  const activeCount = SCHEDULED_TASKS.filter(t => t.status === 'active').length;

  const now = currentTime;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const day = now.getDay();
  const isWeekday = day >= 1 && day <= 5;
  const isFriday = day === 5;

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '12px',
          background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Bot size={22} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1c1917', margin: 0 }}>비봇 매니지먼트</h1>
          <p style={{ fontSize: '13px', color: '#78716c', margin: 0 }}>AI 업무 자동화 현황</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* 상태 카드들 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {/* 오늘 진행 현황 */}
          <div style={{
            background: '#fff', borderRadius: '12px', padding: '20px',
            border: '1px solid #e7e5e4',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <TimeIcon size={16} color="#2563eb" />
              <span style={{ fontSize: '13px', color: '#78716c', fontWeight: 500 }}>오늘 진행</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#1c1917' }}>
              {completedCount}<span style={{ fontSize: '14px', color: '#a8a29e', fontWeight: 500 }}> / {todayTotal}</span>
            </div>
            <div style={{ fontSize: '12px', color: '#78716c', marginTop: '4px' }}>작업 완료</div>
          </div>

          {/* 다음 작업 */}
          <div style={{
            background: '#fff', borderRadius: '12px', padding: '20px',
            border: '1px solid #e7e5e4',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Clock size={16} color="#f59e0b" />
              <span style={{ fontSize: '13px', color: '#78716c', fontWeight: 500 }}>다음 작업</span>
            </div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#1c1917' }}>
              {nextTask?.name ?? '없음'}
            </div>
            <div style={{ fontSize: '12px', color: '#78716c', marginTop: '4px' }}>
              {nextTask ? `${nextTask.time} · ${nextTask.schedule}` : '-'}
            </div>
          </div>

          {/* 등록된 작업 수 */}
          <div style={{
            background: '#fff', borderRadius: '12px', padding: '20px',
            border: '1px solid #e7e5e4',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Zap size={16} color="#10b981" />
              <span style={{ fontSize: '13px', color: '#78716c', fontWeight: 500 }}>등록된 작업</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#1c1917' }}>
              {activeCount}
            </div>
            <div style={{ fontSize: '12px', color: '#78716c', marginTop: '4px' }}>활성 상태</div>
          </div>
        </div>

        {/* 타임라인 */}
        <div style={{
          background: '#fff', borderRadius: '12px', padding: '24px',
          border: '1px solid #e7e5e4',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1c1917', margin: 0 }}>
              오늘의 작업 스케줄
            </h2>
            <span style={{ fontSize: '12px', color: '#a8a29e' }}>
              {now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {SCHEDULED_TASKS.map((task, idx) => {
              const [h, m] = task.time.split(':').map(Number);
              const taskMinutes = h * 60 + m;
              const isToday =
                task.schedule === '매일' ||
                (task.schedule === '평일' && isWeekday) ||
                (task.schedule === '금요일' && isFriday);

              const isDone = isToday && taskMinutes <= currentMinutes;
              const isNext = nextTask?.id === task.id;
              const catStyle = CATEGORY_STYLES[task.category];
              const TaskIcon = task.icon;

              return (
                <div
                  key={task.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '16px',
                    padding: '14px 0',
                    borderBottom: idx < SCHEDULED_TASKS.length - 1 ? '1px solid #f5f4f2' : 'none',
                    opacity: !isToday ? 0.4 : isDone ? 0.6 : 1,
                  }}
                >
                  {/* 타임라인 아이콘 */}
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isDone ? '#dcfce7' : isNext ? '#dbeafe' : '#f5f4f2',
                  }}>
                    {isDone ? (
                      <CheckCircle2 size={16} color="#16a34a" />
                    ) : (
                      <TaskIcon size={16} color={isNext ? '#2563eb' : '#78716c'} />
                    )}
                  </div>

                  {/* 내용 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        fontSize: '14px', fontWeight: isNext ? 600 : 500,
                        color: isDone ? '#78716c' : '#1c1917',
                        textDecoration: isDone ? 'line-through' : 'none',
                      }}>
                        {task.name}
                      </span>
                      {isNext && (
                        <span style={{
                          fontSize: '11px', fontWeight: 600, color: '#2563eb',
                          background: '#dbeafe', padding: '2px 8px', borderRadius: '4px',
                        }}>다음</span>
                      )}
                      {!isToday && (
                        <span style={{
                          fontSize: '11px', fontWeight: 500, color: '#a8a29e',
                          background: '#f5f4f2', padding: '2px 8px', borderRadius: '4px',
                        }}>오늘 아님</span>
                      )}
                    </div>
                    <p style={{ fontSize: '12px', color: '#a8a29e', margin: '4px 0 0', lineHeight: '1.4' }}>
                      {task.description}
                    </p>
                  </div>

                  {/* 메타 정보 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{
                      fontSize: '11px', fontWeight: 500,
                      color: catStyle.text, background: catStyle.bg,
                      padding: '2px 8px', borderRadius: '4px',
                    }}>{catStyle.label}</span>
                    <span style={{
                      fontSize: '13px', fontWeight: 500, color: '#78716c',
                      fontVariantNumeric: 'tabular-nums',
                      minWidth: '44px', textAlign: 'right',
                    }}>{task.time}</span>
                    <span style={{
                      fontSize: '11px', color: '#a8a29e', minWidth: '36px',
                    }}>{task.schedule}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
