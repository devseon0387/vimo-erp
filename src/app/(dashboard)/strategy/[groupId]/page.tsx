'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Plus, FileText, Trash2, ChevronRight,
  Folder, Target, Lightbulb, Rocket, BarChart2, Zap, Star,
  Gem, Globe, Bookmark, Briefcase, Brain, Shield,
  TrendingUp, Flag, Layers, Users, Package, Coffee,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { strategyApi, type StrategyGroup, type StrategyDoc } from '@/lib/strategy-api';

// ── 아이콘/색상 팔레트 (strategy/page.tsx와 동일)
const ICON_OPTIONS = [
  { name: 'Folder',     Icon: Folder      },
  { name: 'Target',     Icon: Target      },
  { name: 'Lightbulb',  Icon: Lightbulb   },
  { name: 'Rocket',     Icon: Rocket      },
  { name: 'BarChart2',  Icon: BarChart2   },
  { name: 'Zap',        Icon: Zap         },
  { name: 'Star',       Icon: Star        },
  { name: 'Gem',        Icon: Gem         },
  { name: 'Globe',      Icon: Globe       },
  { name: 'Bookmark',   Icon: Bookmark    },
  { name: 'Briefcase',  Icon: Briefcase   },
  { name: 'Brain',      Icon: Brain       },
  { name: 'Shield',     Icon: Shield      },
  { name: 'TrendingUp', Icon: TrendingUp  },
  { name: 'Flag',       Icon: Flag        },
  { name: 'Layers',     Icon: Layers      },
  { name: 'Users',      Icon: Users       },
  { name: 'Package',    Icon: Package     },
  { name: 'Coffee',     Icon: Coffee      },
];

const COLOR_OPTIONS = [
  { color: '#f97316', bg: '#fff7f3', border: '#fde8d8' },
  { color: '#3b82f6', bg: '#f3f8ff', border: '#dbeafe' },
  { color: '#10b981', bg: '#f3fff6', border: '#d1fae5' },
  { color: '#8b5cf6', bg: '#fdf3ff', border: '#e9d5ff' },
  { color: '#f59e0b', bg: '#fffdf3', border: '#fef3c7' },
  { color: '#14b8a6', bg: '#f3fffe', border: '#ccfbf1' },
  { color: '#ef4444', bg: '#fff5f5', border: '#fecaca' },
  { color: '#ec4899', bg: '#fff3f9', border: '#fbcfe8' },
  { color: '#6366f1', bg: '#f5f3ff', border: '#e0e7ff' },
  { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
];

function parseGroupIcon(emoji: string) {
  const [iconName, color] = emoji?.split(':') ?? [];
  const resolvedColor = color || '#f97316';
  const found = ICON_OPTIONS.find(o => o.name === iconName);
  const Icon  = found?.Icon ?? Folder;
  const cfg   = COLOR_OPTIONS.find(o => o.color === resolvedColor) ?? COLOR_OPTIONS[0];
  return { Icon, iconName: iconName || 'Folder', color: resolvedColor, bg: cfg.bg, border: cfg.border };
}

// ── 아이콘+색상 피커
function IconColorPicker({
  iconName, color, onChange, onClose,
}: {
  iconName: string; color: string;
  onChange: (icon: string, color: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94 }}
        transition={{ duration: 0.13 }}
        style={{
          position: 'absolute', top: '60px', left: 0, zIndex: 50,
          background: '#fff', border: '1px solid #ede9e6',
          borderRadius: '14px', boxShadow: '0 8px 28px rgba(0,0,0,0.12)',
          padding: '14px', width: '224px',
        }}
      >
        <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c4b5a5', marginBottom: '8px' }}>아이콘</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', marginBottom: '14px' }}>
          {ICON_OPTIONS.map(({ name, Icon }) => {
            const sel = name === iconName;
            return (
              <button
                key={name}
                onClick={() => onChange(name, color)}
                style={{
                  width: '36px', height: '36px', borderRadius: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: sel ? `2px solid ${color}` : '2px solid transparent',
                  background: sel ? `${color}18` : 'transparent',
                  cursor: 'pointer', transition: 'all 0.1s',
                }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = '#f5f3f1'; }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon size={16} style={{ color: sel ? color : '#78716c' }} />
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c4b5a5', marginBottom: '8px' }}>색상</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {COLOR_OPTIONS.map(opt => {
            const sel = opt.color === color;
            return (
              <button
                key={opt.color}
                onClick={() => onChange(iconName, opt.color)}
                style={{
                  width: '24px', height: '24px', borderRadius: '50%',
                  background: opt.color, cursor: 'pointer',
                  border: sel ? `3px solid ${opt.color}` : '3px solid transparent',
                  outline: sel ? `2px solid #fff` : 'none',
                  outlineOffset: '-4px',
                  boxShadow: sel ? `0 0 0 2px ${opt.color}` : 'none',
                  transition: 'transform 0.1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
              />
            );
          })}
        </div>
      </motion.div>
    </>
  );
}

export default function GroupPage() {
  const router  = useRouter();
  const params  = useParams();
  const groupId = params.groupId as string;

  const [group,      setGroup     ] = useState<StrategyGroup | null>(null);
  const [docs,       setDocs      ] = useState<StrategyDoc[]>([]);
  const [loading,    setLoading   ] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      strategyApi.getGroup(groupId),
      strategyApi.getDocs(groupId),
    ]).then(([g, ds]) => {
      setGroup(g);
      setDocs(ds);
    }).finally(() => setLoading(false));
  }, [groupId]);

  const addDoc = async () => {
    const doc = await strategyApi.createDoc(groupId);
    router.push(`/strategy/${groupId}/${doc.id}`);
  };

  const deleteDoc = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDocs(p => p.filter(d => d.id !== id));
    await strategyApi.deleteDoc(id);
  };

  const updateIcon = async (iconName: string, color: string) => {
    const emoji = `${iconName}:${color}`;
    setGroup(prev => prev ? { ...prev, emoji } : prev);
    await strategyApi.updateGroup(groupId, { emoji });
  };

  const fmt = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '240px' }}>
      <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid #ede9e6', borderTopColor: '#f97316', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (!group) return (
    <div style={{ textAlign: 'center', padding: '80px 24px' }}>
      <p style={{ color: '#a8a29e', fontSize: '14px', marginBottom: '12px' }}>그룹을 찾을 수 없어요</p>
      <button onClick={() => router.push('/strategy')} style={{ fontSize: '13px', color: '#f97316', background: 'none', border: 'none', cursor: 'pointer' }}>
        전략으로 돌아가기
      </button>
    </div>
  );

  const { Icon: GroupIcon, iconName: gIconName, color: gColor, bg: gBg, border: gBorder } = parseGroupIcon(group.emoji);

  return (
    <div style={{ position: 'relative' }}>
      {/* ── 브레드크럼 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '28px' }}>
        <button
          onClick={() => router.push('/strategy')}
          style={{ fontSize: '12px', color: '#a8a29e', background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.12s' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#44403c'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#a8a29e'; }}
        >
          전략
        </button>
        <ChevronRight size={12} style={{ color: '#d6cec8', flexShrink: 0 }} />
        <span style={{ fontSize: '12px', color: '#44403c', fontWeight: 500 }}>{group.name}</span>
      </div>

      {/* ── 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* 클릭 가능한 아이콘 */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setPickerOpen(p => !p)}
              title="아이콘 변경"
              style={{
                width: '52px', height: '52px', borderRadius: '14px',
                background: gBg, border: `1px solid ${gBorder}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, cursor: 'pointer', transition: 'opacity 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.75'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
            >
              <GroupIcon size={22} style={{ color: gColor }} />
            </button>
            <AnimatePresence>
              {pickerOpen && (
                <IconColorPicker
                  iconName={gIconName}
                  color={gColor}
                  onChange={(icon, color) => { updateIcon(icon, color); }}
                  onClose={() => setPickerOpen(false)}
                />
              )}
            </AnimatePresence>
          </div>

          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1c1917', letterSpacing: '-0.02em', lineHeight: 1.2 }}>{group.name}</h1>
            <p style={{ fontSize: '12px', color: '#a8a29e', marginTop: '3px' }}>{docs.length}개 페이지</p>
          </div>
        </div>
        <button
          onClick={addDoc}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '9px 16px', borderRadius: '9px',
            background: '#f97316', color: '#fff',
            border: 'none', cursor: 'pointer',
            fontSize: '13px', fontWeight: 600,
            transition: 'background 0.12s', flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#c2410c'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#f97316'; }}
        >
          <Plus size={14} /> 새 페이지
        </button>
      </div>

      {/* ── 페이지 목록 ── */}
      {docs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '72px 24px' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: '#f7f5f3', border: '1px solid #ede9e6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <FileText size={22} style={{ color: '#c4b5a5' }} />
          </div>
          <p style={{ fontSize: '15px', fontWeight: 600, color: '#44403c', marginBottom: '6px' }}>아직 페이지가 없어요</p>
          <p style={{ fontSize: '13px', color: '#a8a29e', marginBottom: '20px' }}>첫 번째 페이지를 작성해보세요</p>
          <button
            onClick={addDoc}
            style={{
              padding: '9px 18px', borderRadius: '9px',
              background: '#f97316', color: '#fff',
              border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#c2410c'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f97316'; }}
          >
            첫 번째 페이지 만들기
          </button>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #ede9e6', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 36px', padding: '8px 20px', borderBottom: '1px solid #f5f3f1', background: '#faf9f8' }}>
            {['제목', '수정일', ''].map((h, i) => (
              <p key={h + i} style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c4b5a5', textAlign: i === 1 ? 'right' : 'left' }}>{h}</p>
            ))}
          </div>

          {docs.map((doc, i) => (
            <div
              key={doc.id}
              onClick={() => router.push(`/strategy/${groupId}/${doc.id}`)}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 80px 36px',
                alignItems: 'center',
                padding: '13px 20px',
                borderBottom: i < docs.length - 1 ? '1px solid #f5f3f1' : 'none',
                cursor: 'pointer', transition: 'background 0.1s',
              }}
              className="doc-row"
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#faf9f8'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: '#f5f3f1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FileText size={13} style={{ color: '#a8a29e' }} />
                </div>
                <p style={{ fontSize: '14px', fontWeight: 500, color: '#1c1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</p>
              </div>
              <p style={{ fontSize: '11px', color: '#a8a29e', textAlign: 'right', flexShrink: 0 }}>{fmt(doc.updatedAt)}</p>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={e => deleteDoc(doc.id, e)}
                  style={{
                    width: '26px', height: '26px', borderRadius: '7px',
                    background: 'transparent', border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', opacity: 0, transition: 'opacity 0.12s, background 0.12s',
                  }}
                  className="doc-del"
                  onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <Trash2 size={13} style={{ color: '#f87171' }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .doc-row:hover .doc-del { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
