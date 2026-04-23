'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, AlignLeft, Hash, List, ListOrdered, CheckSquare, Minus, Lightbulb, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { strategyApi } from '@/lib/strategy-api';

// ─── Types ───────────────────────────────────────────────────────────────────
type BlockType =
  | 'paragraph' | 'heading1' | 'heading2' | 'heading3'
  | 'bullet' | 'numbered' | 'todo' | 'divider' | 'callout';

interface Block {
  id: string;
  type: BlockType;
  content: string;
  checked?: boolean;
}

interface StrategyDoc {
  id: string;
  groupId: string;
  title: string;
  emoji: string;
  blocks: Block[];
  createdAt: string;
  updatedAt: string;
}

interface StrategyGroup {
  id: string;
  name: string;
  emoji: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const BLOCK_MENU = [
  { type: 'paragraph'  as BlockType, label: '텍스트',    desc: '일반 텍스트',    icon: AlignLeft   },
  { type: 'heading1'   as BlockType, label: '제목 1',    desc: '큰 제목',        icon: Hash        },
  { type: 'heading2'   as BlockType, label: '제목 2',    desc: '중간 제목',      icon: Hash        },
  { type: 'heading3'   as BlockType, label: '제목 3',    desc: '작은 제목',      icon: Hash        },
  { type: 'bullet'     as BlockType, label: '글머리',    desc: '순서 없는 목록', icon: List        },
  { type: 'numbered'   as BlockType, label: '번호 목록', desc: '순서 있는 목록', icon: ListOrdered },
  { type: 'todo'       as BlockType, label: '할 일',     desc: '체크박스',       icon: CheckSquare },
  { type: 'divider'    as BlockType, label: '구분선',    desc: '수평선 삽입',    icon: Minus       },
  { type: 'callout'    as BlockType, label: '콜아웃',    desc: '강조 블록',      icon: Lightbulb   },
];

const MD_SHORTCUTS: Record<string, BlockType> = {
  '#': 'heading1', '##': 'heading2', '###': 'heading3',
  '-': 'bullet', '1.': 'numbered', '[]': 'todo', '---': 'divider', '>': 'callout',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);
const mkBlock = (type: BlockType = 'paragraph'): Block => ({ id: uid(), type, content: '', checked: false });

// ─── Block Component ─────────────────────────────────────────────────────────
interface BlockElProps {
  block: Block;
  focused: boolean;
  numberedIdx: number;
  onUpdate(id: string, u: Partial<Block>): void;
  onEnter(id: string): void;
  onBackspace(id: string): void;
  onFocus(id: string): void;
  onSlash(id: string, el: HTMLElement): void;
  onArrowUp(id: string): void;
  onArrowDown(id: string): void;
}

function BlockEl({
  block, focused, numberedIdx,
  onUpdate, onEnter, onBackspace, onFocus, onSlash, onArrowUp, onArrowDown,
}: BlockElProps) {
  const ref = useRef<HTMLDivElement>(null);
  const composing = useRef(false);

  useEffect(() => {
    if (ref.current) ref.current.textContent = block.content;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id]);

  useEffect(() => {
    if (!focused || !ref.current) return;
    ref.current.focus();
    try {
      const range = document.createRange();
      const sel = window.getSelection();
      const node = ref.current;
      const last = node.lastChild;
      if (last) range.setStart(last, last.textContent?.length ?? 0);
      else range.setStart(node, 0);
      range.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch {}
  }, [focused, block.id, block.type]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (composing.current) return;
    const text = ref.current?.textContent ?? '';
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onEnter(block.id);
    } else if (e.key === 'Backspace' && text === '') {
      e.preventDefault();
      if (block.type !== 'paragraph' && block.type !== 'divider') {
        onUpdate(block.id, { type: 'paragraph' });
        requestAnimationFrame(() => ref.current?.focus());
      } else {
        onBackspace(block.id);
      }
    } else if (e.key === 'ArrowUp') {
      try { if (window.getSelection()?.getRangeAt(0).startOffset === 0) { e.preventDefault(); onArrowUp(block.id); } } catch {}
    } else if (e.key === 'ArrowDown') {
      try { if ((window.getSelection()?.getRangeAt(0).startOffset ?? 0) >= text.length) { e.preventDefault(); onArrowDown(block.id); } } catch {}
    } else if (e.key === ' ' && !e.shiftKey && MD_SHORTCUTS[text]) {
      e.preventDefault();
      if (ref.current) ref.current.textContent = '';
      onUpdate(block.id, { type: MD_SHORTCUTS[text], content: '' });
    }
  };

  const handleInput = () => {
    const text = ref.current?.textContent ?? '';
    onUpdate(block.id, { content: text });
    if (text === '/') onSlash(block.id, ref.current!);
  };

  const placeholder = focused
    ? (block.type === 'paragraph' ? "내용을 입력하거나 '/'로 명령어를 사용하세요" : '내용 입력...')
    : '';

  const BASE = 'st-page-edit outline-none w-full break-words min-h-[1.5em]';

  const shared = {
    ref,
    contentEditable: true as const,
    suppressContentEditableWarning: true,
    onKeyDown: handleKeyDown,
    onInput: handleInput,
    onFocus: () => onFocus(block.id),
    onCompositionStart: () => { composing.current = true; },
    onCompositionEnd: () => { composing.current = false; },
    'data-placeholder': placeholder,
    className: BASE,
  };

  if (block.type === 'divider') return (
    <div style={{ padding: '10px 0', cursor: 'default' }} onClick={() => onFocus(block.id)}>
      <div style={{ height: '1px', background: '#f0ece9' }} />
    </div>
  );
  if (block.type === 'heading1') return (
    <div {...shared} style={{ fontSize: '26px', fontWeight: 700, color: '#1c1917', lineHeight: 1.3, paddingTop: '28px', paddingBottom: '4px', letterSpacing: '-0.02em' }} />
  );
  if (block.type === 'heading2') return (
    <div {...shared} style={{ fontSize: '20px', fontWeight: 700, color: '#1c1917', lineHeight: 1.4, paddingTop: '20px', paddingBottom: '2px', letterSpacing: '-0.015em' }} />
  );
  if (block.type === 'heading3') return (
    <div {...shared} style={{ fontSize: '16px', fontWeight: 600, color: '#1c1917', lineHeight: 1.5, paddingTop: '14px' }} />
  );
  if (block.type === 'bullet') return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
      <span style={{ marginTop: '10px', width: '5px', height: '5px', borderRadius: '50%', background: '#c4b5a5', flexShrink: 0 }} />
      <div {...shared} style={{ fontSize: '15px', color: '#374151', lineHeight: 1.75, flex: 1 }} />
    </div>
  );
  if (block.type === 'numbered') return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
      <span style={{ fontSize: '14px', color: '#a8a29e', marginTop: '2px', flexShrink: 0, width: '20px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{numberedIdx}.</span>
      <div {...shared} style={{ fontSize: '15px', color: '#374151', lineHeight: 1.75, flex: 1 }} />
    </div>
  );
  if (block.type === 'todo') return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
      <button
        onClick={() => onUpdate(block.id, { checked: !block.checked })}
        style={{
          marginTop: '3px',
          width: '17px', height: '17px', borderRadius: '4px', flexShrink: 0,
          border: block.checked ? '2px solid #f97316' : '2px solid #d6cec8',
          background: block.checked ? '#f97316' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'all 0.15s',
        }}
      >
        {block.checked && (
          <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <div
        {...shared}
        style={{
          fontSize: '15px', lineHeight: 1.75, flex: 1,
          color: block.checked ? '#a8a29e' : '#374151',
          textDecoration: block.checked ? 'line-through' : 'none',
        }}
      />
    </div>
  );
  if (block.type === 'callout') return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', background: '#fff7f3', borderRadius: '10px', padding: '12px 16px', border: '1px solid #fde8d8', margin: '2px 0' }}>
      <span style={{ fontSize: '16px', flexShrink: 0, lineHeight: 1.75 }}>💡</span>
      <div {...shared} style={{ fontSize: '15px', color: '#374151', lineHeight: 1.75, flex: 1 }} />
    </div>
  );
  return <div {...shared} style={{ fontSize: '15px', color: '#374151', lineHeight: 1.75 }} />;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PageEditor() {
  const router = useRouter();
  const params = useParams();
  const groupId = params.groupId as string;
  const pageId = params.pageId as string;

  const [doc, setDoc] = useState<StrategyDoc | null>(null);
  const [group, setGroup] = useState<StrategyGroup | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [slash, setSlash] = useState<{ blockId: string; top: number; left: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const titleRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([
      strategyApi.getGroup(groupId),
      strategyApi.getDoc(pageId),
    ]).then(([g, d]) => {
      setGroup(g);
      setDoc(d as unknown as StrategyDoc | null);
      if (d && titleRef.current) titleRef.current.textContent = d.title;
    }).finally(() => setLoading(false));
  }, [groupId, pageId]);

  // 타이틀 sync
  useEffect(() => {
    if (titleRef.current && doc && titleRef.current.textContent !== doc.title)
      titleRef.current.textContent = doc.title;
  }, [doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveDoc = useCallback((updated: StrategyDoc) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      strategyApi.updateDoc(updated.id, updated).catch(() => {});
    }, 300);
  }, []);

  const patchDoc = useCallback((u: Partial<StrategyDoc>) => {
    setDoc(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...u, updatedAt: new Date().toISOString() };
      saveDoc(next);
      return next;
    });
  }, [saveDoc]);

  const patchBlock = useCallback((blockId: string, u: Partial<Block>) => {
    setDoc(prev => {
      if (!prev) return prev;
      const next = {
        ...prev,
        blocks: prev.blocks.map(b => b.id === blockId ? { ...b, ...u } : b),
        updatedAt: new Date().toISOString(),
      };
      saveDoc(next);
      return next;
    });
  }, [saveDoc]);

  const insertBlock = useCallback((afterId: string) => {
    const nb = mkBlock();
    setDoc(prev => {
      if (!prev) return prev;
      const i = prev.blocks.findIndex(b => b.id === afterId);
      const arr = [...prev.blocks];
      arr.splice(i + 1, 0, nb);
      const next = { ...prev, blocks: arr, updatedAt: new Date().toISOString() };
      saveDoc(next);
      return next;
    });
    setFocusId(nb.id);
  }, [saveDoc]);

  const removeBlock = useCallback((blockId: string) => {
    setDoc(prev => {
      if (!prev || prev.blocks.length <= 1) return prev;
      const i = prev.blocks.findIndex(b => b.id === blockId);
      const prevBlock = prev.blocks[i - 1];
      if (prevBlock) setTimeout(() => setFocusId(prevBlock.id), 0);
      const next = {
        ...prev,
        blocks: prev.blocks.filter(b => b.id !== blockId),
        updatedAt: new Date().toISOString(),
      };
      saveDoc(next);
      return next;
    });
  }, [saveDoc]);

  const navBlock = useCallback((blockId: string, dir: 1 | -1) => {
    setDoc(prev => {
      if (!prev) return prev;
      const i = prev.blocks.findIndex(b => b.id === blockId);
      const t = prev.blocks[i + dir];
      if (t) setFocusId(t.id);
      return prev;
    });
  }, []);

  const handleSlash = useCallback((blockId: string, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setSlash({ blockId, top: rect.bottom + 8, left: rect.left });
  }, []);

  const applySlash = useCallback((type: BlockType) => {
    if (!slash) return;
    patchBlock(slash.blockId, { type, content: '' });
    const sid = slash.blockId;
    setSlash(null);
    setTimeout(() => setFocusId(sid), 0);
  }, [slash, patchBlock]);

  const getNumbIdx = (blocks: Block[], idx: number) => {
    let n = 0;
    for (let i = idx; i >= 0; i--) { if (blocks[i].type === 'numbered') n++; else break; }
    return n;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-800" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="text-center py-24">
        <p className="text-gray-400">페이지를 찾을 수 없어요</p>
        <button onClick={() => router.push(`/strategy/${groupId}`)} className="mt-4 text-sm text-orange-500 hover:text-orange-700 transition-colors">
          그룹으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <style>{`
        .st-page-edit { caret-color: #1c1917; }
        .st-page-edit:empty::before {
          content: attr(data-placeholder);
          color: #d6cec8;
          pointer-events: none;
        }
      `}</style>

      {/* ── 브레드크럼 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
        <button
          onClick={() => router.push('/strategy')}
          style={{ fontSize: '12px', color: '#a8a29e', background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.12s' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#44403c'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#a8a29e'; }}
        >전략</button>
        <ArrowLeft size={11} style={{ color: '#d6cec8', transform: 'rotate(180deg)', flexShrink: 0 }} />
        <button
          onClick={() => router.push(`/strategy/${groupId}`)}
          style={{ fontSize: '12px', color: '#a8a29e', background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.12s' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#44403c'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#a8a29e'; }}
        >
          {group ? `${group.emoji} ${group.name}` : '그룹'}
        </button>
        <ArrowLeft size={11} style={{ color: '#d6cec8', transform: 'rotate(180deg)', flexShrink: 0 }} />
        <span style={{ fontSize: '12px', color: '#44403c', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
          {doc.title || '제목 없음'}
        </span>
      </div>

      {/* ── 제목 카드 ── */}
      <div style={{
        maxWidth: 'var(--doc-max-w, 960px)',
        background: '#ffffff',
        border: '1px solid #ede9e6',
        borderRadius: '16px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        padding: '36px 56px 32px',
        marginBottom: '12px',
        transition: 'max-width 0.2s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* 문서 아이콘 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: '#fff7f3', border: '1px solid #fde8d8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FileText size={22} style={{ color: '#f97316' }} />
          </div>
        </div>

        {/* 제목 */}
        <div
          ref={titleRef}
          contentEditable
          suppressContentEditableWarning
          data-placeholder="제목 없음"
          onInput={() => patchDoc({ title: titleRef.current?.textContent?.trim() || '새 페이지' })}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (doc.blocks.length) setFocusId(doc.blocks[0].id);
            }
          }}
          className="st-page-edit"
          style={{
            fontSize: '34px', fontWeight: 700, color: '#1c1917',
            outline: 'none', width: '100%',
            lineHeight: 1.3, marginBottom: '10px',
            letterSpacing: '-0.025em',
          } as React.CSSProperties}
        />

        {/* 메타 정보 */}
        <p style={{ fontSize: '11px', color: '#c4b5a5' }}>
          {new Date(doc.updatedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 수정
        </p>
      </div>

      {/* ── 본문 카드 ── */}
      <div style={{
        maxWidth: 'var(--doc-max-w, 960px)',
        background: '#ffffff',
        border: '1px solid #ede9e6',
        borderRadius: '16px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        padding: '40px 56px 80px',
        transition: 'max-width 0.2s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* 블록들 */}
        <div>
          {doc.blocks.map((block, idx) => (
            <div key={block.id} style={{ padding: '2px 0' }}>
              <BlockEl
                block={block}
                focused={focusId === block.id}
                numberedIdx={getNumbIdx(doc.blocks, idx)}
                onUpdate={patchBlock}
                onEnter={insertBlock}
                onBackspace={removeBlock}
                onFocus={setFocusId}
                onSlash={handleSlash}
                onArrowUp={id => navBlock(id, -1)}
                onArrowDown={id => navBlock(id, 1)}
              />
            </div>
          ))}
          <div
            style={{ height: '120px', cursor: 'text' }}
            onClick={() => {
              const last = doc.blocks[doc.blocks.length - 1];
              if (!last) return;
              if (last.content) insertBlock(last.id);
              else setFocusId(last.id);
            }}
          />
        </div>
      </div>

      {/* ── / 명령어 메뉴 ── */}
      <AnimatePresence>
        {slash && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 20 }} onClick={() => setSlash(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.14 }}
              style={{
                position: 'fixed', top: slash.top, left: slash.left,
                zIndex: 30, width: '240px',
                background: '#fff', border: '1px solid #ede9e6',
                borderRadius: '14px',
                boxShadow: '0 8px 28px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06)',
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '6px' }}>
                <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c4b5a5', padding: '6px 8px 4px' }}>
                  블록 유형
                </p>
                {BLOCK_MENU.map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.type}
                      onClick={() => applySlash(item.type)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '7px 8px', borderRadius: '9px',
                        background: 'transparent', border: 'none',
                        cursor: 'pointer', textAlign: 'left',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#faf9f8'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{
                        width: '30px', height: '30px', borderRadius: '8px',
                        background: '#f5f3f1', border: '1px solid #ede9e6',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <Icon size={13} style={{ color: '#78716c' }} />
                      </div>
                      <div>
                        <p style={{ fontSize: '13px', fontWeight: 500, color: '#1c1917', lineHeight: 1.3 }}>{item.label}</p>
                        <p style={{ fontSize: '11px', color: '#a8a29e' }}>{item.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
