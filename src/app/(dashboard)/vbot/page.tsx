'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, CheckCircle2, AlertCircle, Zap,
  MessageSquare, Search, Shield, TrendingUp,
  Coffee, Sun, Sunset, Moon,
} from 'lucide-react';
import { TabBar } from '@/components/TabBar';

type Tab = 'schedule' | 'tasks';

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

const SCHEDULED_TASKS: ScheduledTask[] = [
  { id: 'morning-briefing', name: '오전 브리핑', schedule: '매일', time: '08:00', icon: Coffee, description: '날씨, 오늘 전달 일정, 릴리즈 알림을 운영 카톡방에 전송', status: 'active', category: 'report' },
  { id: 'job-check',        name: '일감 확인',  schedule: '평일', time: '08:10', icon: Search, description: '크롤링으로 새 일감을 확인하고 결과 보고', status: 'active', category: 'monitoring' },
  { id: 'kakao-morning',    name: '파트너 카톡 모니터링 (오전)', schedule: '평일', time: '09:00', icon: MessageSquare, description: '파트너 소통방 확인 → 변동사항 있으면 ERP 반영 + 보고', status: 'active', category: 'monitoring' },
  { id: 'erp-monitor',      name: 'ERP 이상 감지', schedule: '평일', time: '10:00', icon: Shield, description: 'ERP 데이터 이상 여부 점검, 이상 시 보고', status: 'active', category: 'alert' },
  { id: 'kakao-afternoon',  name: '파트너 카톡 모니터링 (오후)', schedule: '평일', time: '13:00', icon: MessageSquare, description: '오전 이후 파트너 소통방 변동사항 확인', status: 'active', category: 'monitoring' },
  { id: 'deadline-alert',   name: '내일 마감 알림', schedule: '매일', time: '16:00', icon: AlertCircle, description: '내일 전달할 프로젝트를 운영 카톡방에 전송', status: 'active', category: 'alert' },
  { id: 'weekly-insight',   name: '주간 운영 인사이트', schedule: '금요일', time: '17:00', icon: TrendingUp, description: '주간 운영 데이터 분석 및 인사이트 보고', status: 'active', category: 'analysis' },
  { id: 'kakao-closing',    name: '파트너 카톡 모니터링 (마감)', schedule: '평일', time: '17:30', icon: MessageSquare, description: '당일 소통 종합 정리, 변동 유무와 관계없이 보고', status: 'active', category: 'monitoring' },
  { id: 'daily-health',     name: '일일 자가진단', schedule: '매일', time: '21:00', icon: CheckCircle2, description: '비봇 작업 수행 현황 자가 점검 및 보고', status: 'active', category: 'report' },
];

const CATEGORY_BADGE: Record<ScheduledTask['category'], { dot: string; text: string; bg: string; label: string }> = {
  monitoring: { dot: 'bg-blue-400',   text: 'text-blue-600',   bg: 'bg-blue-50',   label: '모니터링' },
  report:     { dot: 'bg-green-400',  text: 'text-green-600',  bg: 'bg-green-50',  label: '보고' },
  alert:      { dot: 'bg-amber-400',  text: 'text-amber-600',  bg: 'bg-amber-50',  label: '알림' },
  analysis:   { dot: 'bg-purple-400', text: 'text-purple-600', bg: 'bg-purple-50', label: '분석' },
};

function isTaskToday(task: ScheduledTask, day: number): boolean {
  const isWeekday = day >= 1 && day <= 5;
  const isFriday = day === 5;
  if (task.schedule === '매일') return true;
  if (task.schedule === '평일') return isWeekday;
  if (task.schedule === '금요일') return isFriday;
  return false;
}

function getTimeIcon(h: number) {
  if (h < 9) return Sun;
  if (h < 13) return Coffee;
  if (h < 18) return Sunset;
  return Moon;
}

export default function VbotManagementPage() {
  const [now, setNow] = useState(new Date());
  const [activeTab, setActiveTab] = useState<Tab>('schedule');

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const day = now.getDay();
  const TimeIcon = getTimeIcon(now.getHours());

  const todayTasks = useMemo(() => SCHEDULED_TASKS.filter(t => isTaskToday(t, day)), [day]);
  const completedCount = useMemo(
    () => todayTasks.filter(t => {
      const [h, m] = t.time.split(':').map(Number);
      return h * 60 + m <= currentMinutes;
    }).length,
    [todayTasks, currentMinutes],
  );
  const nextTask = useMemo(() => {
    return todayTasks.find(t => {
      const [h, m] = t.time.split(':').map(Number);
      return h * 60 + m > currentMinutes;
    }) ?? null;
  }, [todayTasks, currentMinutes]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'schedule', label: '스케줄' },
    { key: 'tasks', label: '전체 작업' },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 헤더 — management 와 동일 패턴 */}
      <div className="space-y-3">
        <div>
          <h1 className="text-page">비봇 매니지먼트</h1>
          <p className="text-[#78716c] mt-1 text-sm">
            {now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </p>
        </div>

        {/* 탭 */}
        <div className="flex items-center justify-between">
          <TabBar items={tabs} active={activeTab} onChange={setActiveTab} fullWidthMobile={false} />
        </div>
      </div>

      {/* 컨텐츠 */}
      <div className="relative">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === 'schedule' ? (
              <ScheduleView
                now={now}
                day={day}
                currentMinutes={currentMinutes}
                completedCount={completedCount}
                todayTotal={todayTasks.length}
                nextTask={nextTask}
                TimeIcon={TimeIcon}
              />
            ) : (
              <TasksView />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── 스케줄 탭 — 오늘 진행 현황 + 타임라인
function ScheduleView({
  now, day, currentMinutes, completedCount, todayTotal, nextTask, TimeIcon,
}: {
  now: Date;
  day: number;
  currentMinutes: number;
  completedCount: number;
  todayTotal: number;
  nextTask: ScheduledTask | null;
  TimeIcon: React.ElementType;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3 items-start">
      {/* 타임라인 */}
      <div className="bg-white rounded-2xl border border-ink-100 p-4 sm:p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <span className="text-[13px] font-bold text-[#1c1917]">오늘의 작업 스케줄</span>
            <span className="text-[11px] font-semibold text-orange-500">
              {completedCount}/{todayTotal}
            </span>
          </div>
        </div>

        <ul className="space-y-0">
          {SCHEDULED_TASKS.map((task, idx) => {
            const [h, m] = task.time.split(':').map(Number);
            const taskMinutes = h * 60 + m;
            const isToday = isTaskToday(task, day);
            const isDone = isToday && taskMinutes <= currentMinutes;
            const isNext = nextTask?.id === task.id;
            const cat = CATEGORY_BADGE[task.category];
            const TaskIcon = task.icon;

            return (
              <li
                key={task.id}
                className={`flex items-start gap-3 py-3 ${
                  idx < SCHEDULED_TASKS.length - 1 ? 'border-b border-[#f8f7f6]' : ''
                } ${!isToday ? 'opacity-40' : isDone ? 'opacity-60' : ''}`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${
                    isDone
                      ? 'bg-green-50'
                      : isNext
                        ? 'bg-orange-50'
                        : 'bg-[var(--color-ink-50)]'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 size={14} className="text-green-600" />
                  ) : (
                    <TaskIcon size={14} className={isNext ? 'text-orange-500' : 'text-[var(--color-ink-500)]'} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[13px] ${
                        isNext ? 'font-semibold' : 'font-medium'
                      } ${isDone ? 'text-[var(--color-ink-500)] line-through' : 'text-[#1c1917]'}`}
                    >
                      {task.name}
                    </span>
                    {isNext && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-orange-500 text-white">
                        다음
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--color-ink-400)] mt-0.5 leading-relaxed">
                    {task.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${cat.bg} ${cat.text}`}>
                    {cat.label}
                  </span>
                  <span className="text-[12px] font-medium text-[var(--color-ink-500)] tabular-nums min-w-[38px] text-right">
                    {task.time}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 우측 요약 — management 의 사이드 카드 패턴 */}
      <div className="hidden lg:block space-y-3">
        {/* 현재 시각 / 오늘 진행 */}
        <div className="bg-white rounded-2xl border border-ink-100 p-4">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5">
              <TimeIcon size={13} className="text-orange-500" />
              <span className="text-[13px] font-bold text-[#1c1917]">오늘 현황</span>
            </div>
            <span className="text-[11px] text-[var(--color-ink-400)] tabular-nums">
              {now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-[28px] font-bold text-[#1c1917] leading-none tabular-nums">
              {completedCount}
            </span>
            <span className="text-[13px] text-[var(--color-ink-400)]">/ {todayTotal} 완료</span>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-[var(--color-ink-100)] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: todayTotal > 0 ? `${(completedCount / todayTotal) * 100}%` : '0%' }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="h-full bg-orange-500"
            />
          </div>
        </div>

        {/* 다음 작업 */}
        <div className="bg-white rounded-2xl border border-ink-100 p-4">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Clock size={13} className="text-amber-500" />
            <span className="text-[13px] font-bold text-[#1c1917]">다음 작업</span>
          </div>
          {nextTask ? (
            <>
              <div className="text-[14px] font-semibold text-[#1c1917] truncate">{nextTask.name}</div>
              <div className="text-[11px] text-[var(--color-ink-400)] mt-1 tabular-nums">
                {nextTask.time} · {nextTask.schedule}
              </div>
            </>
          ) : (
            <div className="text-[13px] text-[var(--color-ink-400)]">오늘 남은 작업 없음</div>
          )}
        </div>

        {/* 활성 작업 수 */}
        <div className="bg-white rounded-2xl border border-ink-100 p-4">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Zap size={13} className="text-green-500" />
            <span className="text-[13px] font-bold text-[#1c1917]">활성 작업</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-[24px] font-bold text-[#1c1917] leading-none tabular-nums">
              {SCHEDULED_TASKS.filter(t => t.status === 'active').length}
            </span>
            <span className="text-[12px] text-[var(--color-ink-400)]">/ {SCHEDULED_TASKS.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 전체 작업 탭 — 카테고리별 그루핑
function TasksView() {
  const grouped = useMemo(() => {
    const map: Record<ScheduledTask['category'], ScheduledTask[]> = {
      monitoring: [], report: [], alert: [], analysis: [],
    };
    for (const t of SCHEDULED_TASKS) map[t.category].push(t);
    return map;
  }, []);

  return (
    <div className="space-y-4">
      {(Object.keys(grouped) as ScheduledTask['category'][]).map(cat => {
        const items = grouped[cat];
        if (items.length === 0) return null;
        const badge = CATEGORY_BADGE[cat];
        return (
          <div key={cat} className="bg-white rounded-2xl border border-ink-100 p-4 sm:p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2 h-2 rounded-full ${badge.dot}`} />
              <span className={`text-[13px] font-bold ${badge.text}`}>{badge.label}</span>
              <span className="text-[11px] font-semibold text-[var(--color-ink-400)]">{items.length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {items.map(task => {
                const TaskIcon = task.icon;
                return (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 p-3 rounded-xl border border-[var(--color-ink-100)] hover:border-[var(--color-ink-200)] transition-colors"
                  >
                    <div className={`w-8 h-8 rounded-lg ${badge.bg} flex items-center justify-center flex-shrink-0`}>
                      <TaskIcon size={14} className={badge.text} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-[#1c1917] truncate">{task.name}</span>
                        <span className="text-[11px] font-medium text-[var(--color-ink-500)] tabular-nums flex-shrink-0">
                          {task.time}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--color-ink-400)] mt-1 leading-relaxed line-clamp-2">
                        {task.description}
                      </p>
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="text-[10px] font-medium text-[var(--color-ink-500)]">{task.schedule}</span>
                        <span className={`w-1 h-1 rounded-full ${task.status === 'active' ? 'bg-green-500' : 'bg-[var(--color-ink-300)]'}`} />
                        <span className="text-[10px] text-[var(--color-ink-400)]">
                          {task.status === 'active' ? '활성' : '일시정지'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
