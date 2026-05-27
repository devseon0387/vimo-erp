'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Send, X, Loader2, Sparkles, ArrowRight,
  PanelRightOpen, PanelRightClose, RotateCcw,
  Folder, Calendar, FileText,
  Plus, Pencil, Check, AlertTriangle,
  Bot, MessageSquarePlus, HelpCircle, FolderOpen, Briefcase, Users, FilePlus,
} from 'lucide-react';

const OPEN_EVENT = 'fab:action';
const NAV_REGEX = /\[NAV\]\s+(\/[^\s\n]*)/g;
const CARD_REGEX = /\[CARD\]([\s\S]*?)\[\/CARD\]/g;
const ACTION_REGEX = /\[ACTION\]([\s\S]*?)\[\/ACTION\]/g;

const SESSION_KEY = 'bibot.sessionId';
const MESSAGES_KEY = 'bibot.messages';
const MODE_KEY = 'bibot.mode';

type Mode = 'floating' | 'sidebar';

type CardData = {
  type: 'episode' | 'project' | 'client' | 'partner' | 'generic';
  title: string;
  subtitle?: string;
  status?: string;
  href?: string;
  meta?: { label: string; value: string }[];
};

type ActionData = {
  localId: string;
  type: 'create-episode' | 'update-episode-fields';
  projectId?: string;
  id?: string;
  title?: string;
  summary?: string;
  episodeNumber?: number;
  status?: string;
  dueDate?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  assignee?: string;
  manager?: string;
  workContent?: string[];
  fields?: Record<string, unknown>;
  state: 'pending' | 'running' | 'done' | 'error' | 'cancelled';
  resultMessage?: string;
  resultHref?: string;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  pending?: boolean;
  navHref?: string;
  cards?: CardData[];
  actions?: ActionData[];
};

type QuickPrompt = {
  label: string;
  prompt: string;
  icon: React.ElementType;
  handler?: 'recent-navigate' | 'today-due' | 'active-projects';
};

const QUICK_PROMPTS: QuickPrompt[] = [
  { label: '최근 회차로 이동', prompt: '가장 최근에 업데이트된 회차 페이지로 이동해줘', icon: Calendar, handler: 'recent-navigate' },
  { label: '오늘 마감', prompt: '오늘 마감인 회차 알려줘', icon: FileText, handler: 'today-due' },
  { label: '프로젝트 현황', prompt: '진행 중인 프로젝트 요약해줘', icon: Folder, handler: 'active-projects' },
];

type DirectAction = { label: string; icon: React.ElementType; detail: string; primary?: boolean };

function hasTutorial(pathname: string): boolean {
  if (['/management', '/', '/projects', '/clients', '/partners'].includes(pathname)) return true;
  if (/^\/projects\/[^/]+\/episodes\/[^/]+$/.test(pathname)) return true;
  if (/^\/projects\/[^/]+$/.test(pathname)) return true;
  return false;
}

function getDirectActions(pathname: string): DirectAction[] {
  const common: DirectAction[] = [
    { label: '개선사항 보내기', icon: MessageSquarePlus, detail: 'feedback' },
  ];
  if (hasTutorial(pathname)) {
    common.push({ label: '튜토리얼 다시 보기', icon: HelpCircle, detail: 'replay-tutorial' });
  }
  if (pathname === '/management' || pathname === '/') {
    return [{ label: '새 프로젝트 시작', icon: Sparkles, detail: 'new-project', primary: true }, ...common];
  }
  if (pathname === '/projects') {
    return [{ label: '새 프로젝트', icon: FolderOpen, detail: 'new-project', primary: true }, ...common];
  }
  if (pathname === '/clients') {
    return [{ label: '새 클라이언트', icon: Briefcase, detail: 'new-client', primary: true }, ...common];
  }
  if (/^\/projects\/[^/]+$/.test(pathname)) {
    return [{ label: '새 회차', icon: FilePlus, detail: 'new-episode', primary: true }, ...common];
  }
  if (pathname === '/partners') {
    return [{ label: '새 파트너', icon: Users, detail: 'new-partner', primary: true }, ...common];
  }
  return common;
}

function shouldHideWidget(pathname: string): boolean {
  if (/^\/finance\/partner-settlement\/[^/]+/.test(pathname)) return true;
  if (/^\/finance\/manager-settlement\/[^/]+/.test(pathname)) return true;
  return false;
}

function extractMarkers(text: string): { clean: string; navHref?: string; cards: CardData[]; actions: ActionData[] } {
  let clean = text;
  const cards: CardData[] = [];
  const actions: ActionData[] = [];

  clean = clean.replace(ACTION_REGEX, (_, body) => {
    try {
      const json = JSON.parse(body.trim());
      if (json?.type) {
        actions.push({ ...json, localId: crypto.randomUUID(), state: 'pending' });
      }
    } catch {}
    return '';
  });

  clean = clean.replace(CARD_REGEX, (_, body) => {
    try {
      const json = JSON.parse(body.trim());
      if (Array.isArray(json)) {
        for (const item of json) if (item?.title) cards.push(item);
      } else if (json?.title) {
        cards.push(json);
      }
    } catch {}
    return '';
  });

  const navMatch = clean.match(NAV_REGEX);
  let navHref: string | undefined;
  if (navMatch) {
    navHref = navMatch[0].replace(/^\[NAV\]\s+/, '').trim();
    clean = clean.replace(NAV_REGEX, '');
  }

  return { clean: clean.trim(), navHref, cards, actions };
}

export default function BibotWidget() {
  const router = useRouter();
  const pathname = usePathname();
  const directActions = useMemo(() => getDirectActions(pathname), [pathname]);
  const hideWidget = shouldHideWidget(pathname);
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('floating');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navTriggeredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      setSessionId(localStorage.getItem(SESSION_KEY));
      const raw = localStorage.getItem(MESSAGES_KEY);
      if (raw) setMessages(JSON.parse(raw));
      const savedMode = localStorage.getItem(MODE_KEY) as Mode | null;
      if (savedMode === 'sidebar' || savedMode === 'floating') setMode(savedMode);
    } catch {}
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail === 'bibot') setIsOpen(true);
    };
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, []);

  // 메시지 변경마다 즉시 직렬화 → main thread 블로킹 (스트리밍 중 키스트로크 jank).
  // 500ms 디바운스로 채팅 메시지가 빠르게 쌓일 때 직렬화 부담 차단.
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages)); } catch {}
    }, 500);
    return () => clearTimeout(t);
  }, [messages]);

  useEffect(() => {
    try { localStorage.setItem(MODE_KEY, mode); } catch {}
  }, [mode]);

  // 사이드바 모드일 때 메인 컨텐츠가 가려지지 않도록 CSS 변수 설정
  useEffect(() => {
    const root = document.documentElement;
    const active = isOpen && mode === 'sidebar';
    root.style.setProperty('--bibot-pad', active ? '400px' : '0px');
    return () => {
      root.style.setProperty('--bibot-pad', '0px');
    };
  }, [isOpen, mode]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isOpen, mode]);

  const runPrompt = (text: string) => {
    setInput(text);
    setTimeout(() => send(text), 10);
  };

  const runQuick = async (q: QuickPrompt) => {
    if (!q.handler) return runPrompt(q.prompt);

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', text: q.label };
    const assistantMsg: Message = { id: crypto.randomUUID(), role: 'assistant', text: '', pending: true };
    setMessages(prev => [...prev, userMsg, assistantMsg]);

    const finish = (patch: Partial<Message>) => {
      setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, pending: false, ...patch } : m));
    };

    const fetchJSON = async (url: string) => {
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    };

    try {
      if (q.handler === 'recent-navigate') {
        const data = await fetchJSON('/api/bibot/tools?action=recent-episodes&limit=1');
        const ep = data.episodes?.[0];
        if (!ep) return finish({ text: '최근 회차가 없습니다.' });
        const href = `/projects/${ep.project_id}/episodes/${ep.id}`;
        const projectTitle = ep.project_title ?? '프로젝트';
        const statusLabel = ({ in_progress: '진행 중', completed: '완료', pending: '대기', on_hold: '보류' } as Record<string, string>)[ep.status] ?? ep.status;
        finish({
          text: `'${projectTitle}'의 ${ep.episode_number}화 '${ep.title}'로 이동합니다.`,
          cards: [{
            type: 'episode',
            title: `${projectTitle} · ${ep.episode_number}화`,
            subtitle: `${ep.title} · ${statusLabel}`,
            status: ep.status,
            href,
            meta: ep.due_date ? [{ label: '마감', value: String(ep.due_date).slice(0, 10) }] : undefined,
          }],
          navHref: href,
        });
        if (!navTriggeredRef.current.has(assistantMsg.id)) {
          navTriggeredRef.current.add(assistantMsg.id);
          setTimeout(() => router.push(href), 500);
        }
        return;
      }

      if (q.handler === 'today-due') {
        const data = await fetchJSON('/api/bibot/tools?action=today-due-episodes');
        const eps = (data.episodes ?? []) as Array<{
          id: string; project_id: string; episode_number: number; title: string;
          status: string; assignee: string | null; project_title?: string;
        }>;
        if (eps.length === 0) return finish({ text: '오늘 마감인 회차가 없어요. 🎉' });
        finish({
          text: `오늘(${data.today}) 마감 회차 ${eps.length}개입니다.`,
          cards: eps.map(e => ({
            type: 'episode',
            title: `${e.project_title ?? '-'} · ${e.episode_number}화`,
            subtitle: `${e.title}${e.assignee ? ` · ${e.assignee}` : ''}`,
            status: e.status,
            href: `/projects/${e.project_id}/episodes/${e.id}`,
          } as CardData)),
        });
        return;
      }

      if (q.handler === 'active-projects') {
        const data = await fetchJSON('/api/bibot/tools?action=active-projects&limit=20');
        const projs = (data.projects ?? []) as Array<{
          id: string; title: string; client: string | null;
          episode_total: number; episode_done: number;
        }>;
        if (projs.length === 0) return finish({ text: '진행 중인 프로젝트가 없습니다.' });
        finish({
          text: `진행 중인 프로젝트 ${projs.length}개입니다.`,
          cards: projs.map(p => ({
            type: 'project',
            title: p.title,
            subtitle: p.client ?? '',
            status: 'in_progress',
            href: `/projects/${p.id}`,
            meta: [
              { label: '회차', value: `${p.episode_total}개` },
              { label: '완료', value: `${p.episode_done}개` },
              { label: '진행률', value: p.episode_total > 0 ? `${Math.round(p.episode_done / p.episode_total * 100)}%` : '-' },
            ],
          } as CardData)),
        });
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      finish({ text: `⚠️ 조회 실패: ${msg}` });
    }
  };

  const runDirectAction = (detail: string) => {
    window.dispatchEvent(new CustomEvent('fab:action', { detail }));
    setIsOpen(false);
  };

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || isStreaming) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', text };
    const assistantMsg: Message = { id: crypto.randomUUID(), role: 'assistant', text: '', pending: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/bibot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';

        for (const chunk of chunks) {
          const lines = chunk.split('\n');
          let event = 'message';
          let data = '';
          for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (!data) continue;
          try {
            const parsed = JSON.parse(data);
            if (event === 'session' && parsed.sessionId) {
              setSessionId(parsed.sessionId);
              localStorage.setItem(SESSION_KEY, parsed.sessionId);
            } else if (event === 'delta' && parsed.text) {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsg.id
                  ? { ...m, text: m.text + parsed.text, pending: false }
                  : m
              ));
            } else if (event === 'done') {
              if (parsed.sessionId) {
                setSessionId(parsed.sessionId);
                localStorage.setItem(SESSION_KEY, parsed.sessionId);
              }
              const finalText: string = parsed.text || '';
              const { clean, navHref, cards, actions } = extractMarkers(finalText);
              setMessages(prev => prev.map(m =>
                m.id === assistantMsg.id
                  ? { ...m, text: clean || m.text, pending: false, navHref, cards, actions }
                  : m
              ));
              if (navHref && !navTriggeredRef.current.has(assistantMsg.id)) {
                navTriggeredRef.current.add(assistantMsg.id);
                setTimeout(() => router.push(navHref), 400);
              }
            } else if (event === 'error') {
              if (parsed.sessionInvalid) {
                setSessionId(null);
                localStorage.removeItem(SESSION_KEY);
              }
              setMessages(prev => prev.map(m =>
                m.id === assistantMsg.id
                  ? { ...m, text: `⚠️ ${parsed.message}`, pending: false }
                  : m
              ));
            }
          } catch {}
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages(prev => prev.map(m =>
        m.id === assistantMsg.id
          ? { ...m, text: `⚠️ 요청 실패: ${msg}`, pending: false }
          : m
      ));
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const executeAction = async (msgId: string, actionId: string) => {
    const msg = messages.find(m => m.id === msgId);
    const action = msg?.actions?.find(a => a.localId === actionId);
    if (!action || action.state !== 'pending') return;

    setMessages(prev => prev.map(m =>
      m.id !== msgId ? m : {
        ...m,
        actions: m.actions?.map(a => a.localId === actionId ? { ...a, state: 'running' } : a),
      }
    ));

    const payload: Record<string, unknown> = { type: action.type };
    if (action.type === 'create-episode') {
      Object.assign(payload, {
        projectId: action.projectId,
        title: action.title,
        episodeNumber: action.episodeNumber,
        status: action.status,
        dueDate: action.dueDate,
        startDate: action.startDate,
        endDate: action.endDate,
        description: action.description,
        assignee: action.assignee,
        manager: action.manager,
        workContent: action.workContent,
      });
    } else if (action.type === 'update-episode-fields') {
      Object.assign(payload, { id: action.id, fields: action.fields });
    }

    try {
      const res = await fetch('/api/bibot/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setMessages(prev => prev.map(m =>
        m.id !== msgId ? m : {
          ...m,
          actions: m.actions?.map(a => a.localId === actionId
            ? { ...a, state: 'done', resultMessage: '반영 완료', resultHref: data.href }
            : a),
        }
      ));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages(prev => prev.map(m =>
        m.id !== msgId ? m : {
          ...m,
          actions: m.actions?.map(a => a.localId === actionId
            ? { ...a, state: 'error', resultMessage: errMsg }
            : a),
        }
      ));
    }
  };

  const cancelAction = (msgId: string, actionId: string) => {
    setMessages(prev => prev.map(m =>
      m.id !== msgId ? m : {
        ...m,
        actions: m.actions?.map(a => a.localId === actionId ? { ...a, state: 'cancelled' } : a),
      }
    ));
  };

  const doReset = () => {
    abortRef.current?.abort();
    setMessages([]);
    setSessionId(null);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(MESSAGES_KEY);
    setConfirmReset(false);
  };

  // 사이드바 vs 플로팅 위치 클래스
  const panelClass = mode === 'sidebar'
    ? 'fixed top-0 right-0 bottom-0 z-40 w-[400px] max-w-[90vw] bg-white shadow-2xl border-l border-gray-200 flex flex-col overflow-hidden'
    : 'fixed bottom-24 right-6 z-40 w-[400px] max-w-[calc(100vw-3rem)] h-[640px] max-h-[calc(100vh-7rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden';

  const motionProps = mode === 'sidebar'
    ? { initial: { x: 420, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: 420, opacity: 0 } }
    : { initial: { opacity: 0, x: 40, y: 40, scale: 0.95 }, animate: { opacity: 1, x: 0, y: 0, scale: 1 }, exit: { opacity: 0, x: 40, y: 40, scale: 0.95 } };

  if (hideWidget) return null;

  return (
    <>
      {/* 플로팅 버블 */}
      <motion.button
        onClick={() => setIsOpen(v => !v)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.93 }}
        data-tour="tour-fab"
        style={{
          right: 'calc(1.5rem + var(--bibot-pad, 0px))',
          transition: 'right 0.25s cubic-bezier(0.4,0,0.2,1)',
        }}
        className="fixed bottom-6 sm:bottom-8 z-40 w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-pink-500 text-white shadow-xl shadow-orange-500/30 flex items-center justify-center hover:brightness-110"
        aria-label={isOpen ? '비봇 닫기' : '비봇 열기'}
      >
        <AnimatePresence mode="wait" initial={false}>
          {isOpen ? (
            <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <X size={22} strokeWidth={2.5} />
            </motion.span>
          ) : (
            <motion.span key="bot" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <Bot size={24} strokeWidth={2} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            {...motionProps}
            transition={{ type: 'spring', damping: 25, stiffness: 280 }}
            className={panelClass}
          >
          {/* 헤더 */}
          <div className="px-4 py-3 bg-gradient-to-r from-orange-500 to-pink-500 text-white flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="relative w-9 h-9 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <Bot size={18} />
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-orange-500" />
              </div>
              <div>
                <div className="font-bold text-sm leading-tight">비봇</div>
                <div className="text-[11px] text-white/80">
                  {isStreaming ? '생각 중...' : sessionId ? '세션 이어짐' : '새 대화'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setConfirmReset(v => !v)}
                className={`w-7 h-7 rounded flex items-center justify-center transition ${
                  confirmReset ? 'bg-white/20' : 'hover:bg-white/10'
                }`}
                title="대화 초기화"
                aria-label="초기화"
              >
                <RotateCcw size={14} />
              </button>
              <button
                onClick={() => setMode(m => m === 'floating' ? 'sidebar' : 'floating')}
                className="w-7 h-7 rounded hover:bg-white/10 flex items-center justify-center"
                title={mode === 'floating' ? '사이드바로 확장' : '플로팅으로 축소'}
                aria-label="크기 전환"
              >
                {mode === 'floating' ? <PanelRightOpen size={14} /> : <PanelRightClose size={14} />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded hover:bg-white/10 flex items-center justify-center"
                aria-label="닫기"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* 초기화 확인 배너 */}
          <AnimatePresence>
            {confirmReset && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="bg-amber-50 border-b border-amber-200 overflow-hidden flex-shrink-0"
              >
                <div className="px-4 py-3 flex items-center gap-3">
                  <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
                  <div className="flex-1 text-xs text-amber-900">
                    <div className="font-bold">대화 기록과 세션을 초기화할까요?</div>
                    <div className="text-amber-700 text-[11px] mt-0.5">되돌릴 수 없습니다.</div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => setConfirmReset(false)}
                      className="px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100 rounded font-medium"
                    >
                      취소
                    </button>
                    <button
                      onClick={doReset}
                      className="px-3 py-1.5 text-xs bg-amber-600 text-white hover:bg-amber-700 rounded font-bold"
                    >
                      초기화
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 메시지 영역 */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
            {messages.length === 0 && (
              <div className="py-4 px-1">
                <div className="text-center mb-5">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center shadow-md">
                    <Bot size={28} className="text-white" strokeWidth={2} />
                  </div>
                  <div className="font-bold text-gray-800 text-base">안녕하세요, 비봇입니다</div>
                  <div className="text-xs text-gray-500 mt-1">프로젝트·회차·정산, 뭐든 물어보세요</div>
                </div>

                {directActions.length > 0 && (
                  <div className="mb-4">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-1.5">빠른 작업</div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {directActions.map(({ label, icon: Icon, detail, primary }) => (
                        <button
                          key={detail}
                          onClick={() => runDirectAction(detail)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition text-left ${
                            primary
                              ? 'bg-gradient-to-r from-orange-500 to-orange-600 hover:brightness-110 text-white shadow-sm'
                              : 'bg-white hover:bg-orange-50 border border-gray-200 hover:border-orange-300 text-gray-700 hover:text-orange-700'
                          }`}
                        >
                          <Icon size={14} className={`flex-shrink-0 ${primary ? 'text-white' : 'text-orange-500'}`} />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-1.5">비봇에게 물어보기</div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {QUICK_PROMPTS.map(q => {
                      const Icon = q.icon;
                      return (
                        <button
                          key={q.label}
                          onClick={() => runQuick(q)}
                          className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-orange-50 border border-gray-200 hover:border-orange-300 rounded-lg text-xs text-gray-700 hover:text-orange-700 transition text-left group"
                        >
                          <Icon size={14} className="text-orange-500 flex-shrink-0" />
                          <span className="flex-1">{q.label}</span>
                          {q.handler && (
                            <span className="text-[9px] text-gray-400 group-hover:text-orange-500 font-medium">즉시</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {messages.map(m => {
              const isUser = m.role === 'user';
              return (
                <div key={m.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  {m.text && (
                    <div
                      className={`max-w-[88%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                        isUser
                          ? 'bg-orange-500 text-white rounded-br-sm'
                          : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm'
                      }`}
                    >
                      {m.text}
                    </div>
                  )}
                  {m.pending && !m.text && (
                    <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-3 py-2 shadow-sm">
                      <div className="flex gap-1">
                        {[0, 1, 2].map(i => (
                          <span
                            key={i}
                            className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                            style={{ animationDelay: `${i * 120}ms` }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {m.cards && m.cards.length > 0 && (
                    <div className="mt-2 w-full max-w-[88%] space-y-1.5">
                      {m.cards.map((card, i) => (
                        <CardItem key={i} card={card} onNavigate={href => router.push(href)} />
                      ))}
                    </div>
                  )}
                  {m.actions && m.actions.length > 0 && (
                    <div className="mt-2 w-full max-w-[88%] space-y-2">
                      {m.actions.map(action => (
                        <ActionCard
                          key={action.localId}
                          action={action}
                          onApprove={() => executeAction(m.id, action.localId)}
                          onCancel={() => cancelAction(m.id, action.localId)}
                          onNavigate={href => router.push(href)}
                        />
                      ))}
                    </div>
                  )}
                  {m.navHref && !m.cards?.some(c => c.href === m.navHref) && (
                    <button
                      onClick={() => router.push(m.navHref!)}
                      className="mt-1.5 flex items-center gap-1.5 text-[11px] text-orange-600 hover:text-orange-700 font-medium bg-white border border-orange-200 px-2.5 py-1 rounded-full shadow-sm hover:bg-orange-50"
                    >
                      <ArrowRight size={11} />
                      이 페이지로 이동
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* 입력 */}
          <div className="border-t border-gray-200 p-3 bg-white flex-shrink-0">
            <div className="flex items-end gap-2 bg-gray-50 rounded-xl p-1.5 border border-gray-200 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 transition">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="명령이나 질문을 입력하세요..."
                rows={1}
                disabled={isStreaming}
                className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm focus:outline-none max-h-32 disabled:opacity-50"
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || isStreaming}
                className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-pink-500 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 flex-shrink-0"
                aria-label="보내기"
              >
                {isStreaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
            <div className="text-[10px] text-gray-400 mt-1.5 px-1 flex items-center justify-between">
              <span>Enter 전송 · Shift+Enter 줄바꿈</span>
              {mode === 'floating' && <span>↗ 버튼으로 확장</span>}
            </div>
          </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function ActionCard({
  action, onApprove, onCancel, onNavigate,
}: {
  action: ActionData;
  onApprove: () => void;
  onCancel: () => void;
  onNavigate: (href: string) => void;
}) {
  const isCreate = action.type === 'create-episode';
  const Icon = isCreate ? Plus : Pencil;
  const typeLabel = isCreate ? '회차 추가' : '회차 수정';
  const cardAccent = isCreate
    ? { border: 'border-emerald-200', bg: 'bg-emerald-50', stripe: 'border-emerald-100', iconC: 'text-emerald-600', titleC: 'text-emerald-700' }
    : { border: 'border-blue-200', bg: 'bg-blue-50', stripe: 'border-blue-100', iconC: 'text-blue-600', titleC: 'text-blue-700' };

  const fieldLabels: Record<string, string> = {
    title: '제목',
    status: '상태',
    dueDate: '마감일',
    startDate: '시작일',
    endDate: '종료일',
    description: '설명',
    assignee: '담당자',
    manager: '매니저',
    paymentStatus: '정산 상태',
    invoiceStatus: '세금계산서',
  };
  const statusLabels: Record<string, string> = {
    pending: '대기',
    in_progress: '진행 중',
    completed: '완료',
    on_hold: '보류',
  };
  const fmtVal = (k: string, v: unknown) => {
    if (v == null || v === '') return '(빈 값)';
    if (k === 'status' || k === 'paymentStatus' || k === 'invoiceStatus') {
      return statusLabels[String(v)] ?? String(v);
    }
    return String(v);
  };

  return (
    <div className={`bg-white rounded-xl border-2 ${cardAccent.border} shadow-sm overflow-hidden`}>
      <div className={`px-3 py-2 ${cardAccent.bg} border-b ${cardAccent.stripe} flex items-center gap-2`}>
        <Icon size={14} className={cardAccent.iconC} />
        <div className={`text-xs font-bold ${cardAccent.titleC}`}>{typeLabel}</div>
        <div className="ml-auto">
          {action.state === 'pending' && <span className="text-[10px] text-amber-600 font-medium">확인 대기</span>}
          {action.state === 'running' && <span className="text-[10px] text-blue-600 font-medium flex items-center gap-1"><Loader2 size={10} className="animate-spin" />실행 중</span>}
          {action.state === 'done' && <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1"><Check size={10} />완료</span>}
          {action.state === 'error' && <span className="text-[10px] text-red-600 font-medium flex items-center gap-1"><AlertTriangle size={10} />실패</span>}
          {action.state === 'cancelled' && <span className="text-[10px] text-gray-500 font-medium">취소됨</span>}
        </div>
      </div>

      <div className="px-3 py-2.5 space-y-2">
        {isCreate ? (
          <>
            <div className="text-sm font-semibold text-gray-900">{action.title}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              {action.episodeNumber != null && (
                <div><span className="text-gray-500">회차 번호</span> <span className="text-gray-900 font-medium">{action.episodeNumber}화</span></div>
              )}
              {action.status && (
                <div><span className="text-gray-500">상태</span> <span className="text-gray-900 font-medium">{statusLabels[action.status] ?? action.status}</span></div>
              )}
              {action.dueDate && (
                <div><span className="text-gray-500">마감일</span> <span className="text-gray-900 font-medium">{action.dueDate}</span></div>
              )}
              {action.startDate && (
                <div><span className="text-gray-500">시작일</span> <span className="text-gray-900 font-medium">{action.startDate}</span></div>
              )}
              {action.assignee && (
                <div><span className="text-gray-500">담당자</span> <span className="text-gray-900 font-medium">{action.assignee}</span></div>
              )}
              {action.manager && (
                <div><span className="text-gray-500">매니저</span> <span className="text-gray-900 font-medium">{action.manager}</span></div>
              )}
            </div>
            {action.description && (
              <div className="text-[11px] text-gray-600 bg-gray-50 rounded p-2 mt-1">{action.description}</div>
            )}
          </>
        ) : (
          <>
            {action.summary && (
              <div className="text-sm text-gray-800 font-medium">{action.summary}</div>
            )}
            {action.title && (
              <div className="text-[11px] text-gray-500">대상: <span className="text-gray-700">{action.title}</span></div>
            )}
            {action.fields && (
              <div className="space-y-0.5 text-[11px] bg-gray-50 rounded p-2">
                {Object.entries(action.fields).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-gray-500 w-16 flex-shrink-0">{fieldLabels[k] ?? k}</span>
                    <span className="text-gray-900 font-medium break-all">{fmtVal(k, v)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {action.resultMessage && (
          <div className={`text-[11px] px-2 py-1 rounded ${
            action.state === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
          }`}>
            {action.resultMessage}
          </div>
        )}
      </div>

      {action.state === 'pending' && (
        <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition"
          >
            취소
          </button>
          <button
            onClick={onApprove}
            className={`flex-1 py-1.5 text-xs font-bold text-white rounded transition ${
              isCreate ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            실행
          </button>
        </div>
      )}

      {action.state === 'done' && action.resultHref && (
        <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
          <button
            onClick={() => onNavigate(action.resultHref!)}
            className="w-full py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50 rounded transition flex items-center justify-center gap-1"
          >
            <ArrowRight size={12} /> 바로 열기
          </button>
        </div>
      )}
    </div>
  );
}

function CardItem({ card, onNavigate }: { card: CardData; onNavigate: (href: string) => void }) {
  const statusColor = {
    in_progress: 'bg-blue-500',
    completed: 'bg-green-500',
    pending: 'bg-gray-400',
    on_hold: 'bg-amber-500',
  }[card.status ?? ''] ?? 'bg-gray-400';

  const typeIcon = {
    episode: Calendar,
    project: Folder,
    client: FileText,
    partner: FileText,
    generic: FileText,
  }[card.type] ?? FileText;
  const Icon = typeIcon;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:border-orange-300 transition">
      <div className="px-3 py-2.5 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
          <Icon size={14} className="text-orange-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {card.status && <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />}
            <div className="text-sm font-semibold text-gray-900 truncate">{card.title}</div>
          </div>
          {card.subtitle && <div className="text-[11px] text-gray-500 truncate">{card.subtitle}</div>}
        </div>
        {card.href && (
          <button
            onClick={() => onNavigate(card.href!)}
            className="text-orange-600 text-xs font-medium hover:text-orange-700 whitespace-nowrap"
          >
            열기 →
          </button>
        )}
      </div>
      {card.meta && card.meta.length > 0 && (
        <div className="px-3 py-2 bg-gray-50 grid gap-2 text-center border-t border-gray-100" style={{ gridTemplateColumns: `repeat(${card.meta.length}, minmax(0, 1fr))` }}>
          {card.meta.map((m, i) => (
            <div key={i}>
              <div className="text-[10px] text-gray-500">{m.label}</div>
              <div className="text-xs font-medium text-gray-800 truncate">{m.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
