'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, FolderOpen, Trash2, ArrowRight,
  Folder, Target, Lightbulb, Rocket, BarChart2, Zap, Star,
  Gem, Globe, Bookmark, Briefcase, Brain, Shield,
  TrendingUp, Flag, Layers, Users, Package, Coffee,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { strategyApi, type StrategyGroup } from '@/lib/strategy-api';

// ── 아이콘 팔레트
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

// ── 색상 팔레트
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

// ── 직렬화/파싱 헬퍼
// emoji 필드에 "IconName:#color" 형식으로 저장
function parseGroupIcon(emoji: string): { iconName: string; color: string } {
  const [iconName, color] = emoji?.split(':') ?? [];
  return {
    iconName: iconName || 'Folder',
    color:    color    || '#f97316',
  };
}
function serializeGroupIcon(iconName: string, color: string) {
  return `${iconName}:${color}`;
}
function getIconComponent(name: string) {
  return ICON_OPTIONS.find(o => o.name === name)?.Icon ?? Folder;
}
function getColorConfig(color: string) {
  return COLOR_OPTIONS.find(o => o.color === color) ?? COLOR_OPTIONS[0];
}

// ── 아이콘 피커 컴포넌트
function IconColorPicker({
  iconName,
  color,
  onChange,
  onClose,
}: {
  iconName: string;
  color:    string;
  onChange: (icon: string, color: string) => void;
  onClose:  () => void;
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
          position: 'absolute', top: '56px', left: 0, zIndex: 50,
          background: '#fff', border: '1px solid #ede9e6',
          borderRadius: '14px', boxShadow: '0 8px 28px rgba(0,0,0,0.12)',
          padding: '14px', width: '224px',
        }}
      >
        {/* 아이콘 그리드 */}
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

        {/* 색상 그리드 */}
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
                  background: opt.color,
                  border: sel ? `3px solid ${opt.color}` : '3px solid transparent',
                  outline: sel ? `2px solid #fff` : 'none',
                  outlineOffset: '-4px',
                  cursor: 'pointer', transition: 'transform 0.1s',
                  boxShadow: sel ? `0 0 0 2px ${opt.color}` : 'none',
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

export default function StrategyPage() {
  const router = useRouter();
  const [groups,    setGroups   ] = useState<StrategyGroup[]>([]);
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});
  const [isAdding,  setIsAdding ] = useState(false);
  const [newName,   setNewName  ] = useState('');
  const [newIcon,   setNewIcon  ] = useState('Folder');
  const [newColor,  setNewColor ] = useState('#f97316');
  const [pickerOpen, setPickerOpen] = useState(false);        // 새 그룹 피커
  const [editPicker, setEditPicker] = useState<string | null>(null); // 기존 그룹 피커 (group.id)
  const [loading,   setLoading  ] = useState(true);

  useEffect(() => {
    Promise.all([
      strategyApi.getGroups(),
      strategyApi.getAllDocs(),
    ]).then(([gs, allDocs]) => {
      setGroups(gs);
      const counts: Record<string, number> = {};
      gs.forEach(g => { counts[g.id] = allDocs.filter(d => d.groupId === g.id).length; });
      setDocCounts(counts);
    }).finally(() => setLoading(false));
  }, []);

  const addGroup = async () => {
    if (!newName.trim()) return;
    const emoji = serializeGroupIcon(newIcon, newColor);
    const g = await strategyApi.createGroup(newName.trim(), emoji);
    setGroups(p => [...p, g]);
    setDocCounts(p => ({ ...p, [g.id]: 0 }));
    cancel();
    router.push(`/strategy/${g.id}`);
  };

  const cancel = () => { setIsAdding(false); setNewName(''); setNewIcon('Folder'); setNewColor('#f97316'); setPickerOpen(false); };

  const deleteGroup = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setGroups(p => p.filter(g => g.id !== id));
    await strategyApi.deleteGroup(id);
  };

  const updateGroupIcon = async (groupId: string, iconName: string, color: string) => {
    const emoji = serializeGroupIcon(iconName, color);
    setGroups(p => p.map(g => g.id === groupId ? { ...g, emoji } : g));
    await strategyApi.updateGroup(groupId, { emoji });
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '240px' }}>
      <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid #ede9e6', borderTopColor: '#f97316', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const NewIcon = getIconComponent(newIcon);
  const newColorCfg = getColorConfig(newColor);

  return (
    <div>
      {/* ── 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c4b5a5', marginBottom: '6px' }}>Strategy</p>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1c1917', letterSpacing: '-0.02em', lineHeight: 1.2 }}>전략</h1>
          <p style={{ fontSize: '13px', color: '#a8a29e', marginTop: '4px' }}>비모의 전략과 방향을 기록하고 관리해요</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
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
          <Plus size={14} /> 새 그룹
        </button>
      </div>

      {/* ── 새 그룹 폼 ── */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16 }}
            style={{
              background: '#ffffff', border: '1px solid #ede9e6',
              borderRadius: '14px', padding: '20px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              marginBottom: '24px',
            }}
          >
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#78716c', marginBottom: '12px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              새 그룹 만들기
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              {/* 아이콘 버튼 (클릭 시 피커) */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setPickerOpen(p => !p)}
                  title="아이콘 변경"
                  style={{
                    width: '44px', height: '44px', flexShrink: 0,
                    background: newColorCfg.bg, border: `1px solid ${newColorCfg.border}`,
                    borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', transition: 'opacity 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '0.8'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                >
                  <NewIcon size={18} style={{ color: newColor }} />
                </button>
                <AnimatePresence>
                  {pickerOpen && (
                    <IconColorPicker
                      iconName={newIcon}
                      color={newColor}
                      onChange={(icon, color) => { setNewIcon(icon); setNewColor(color); }}
                      onClose={() => setPickerOpen(false)}
                    />
                  )}
                </AnimatePresence>
              </div>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addGroup(); if (e.key === 'Escape') cancel(); }}
                placeholder="그룹 이름을 입력하세요"
                style={{
                  flex: 1, padding: '10px 14px',
                  border: '1px solid #ede9e6', borderRadius: '10px',
                  fontSize: '14px', color: '#1c1917',
                  outline: 'none', background: '#faf9f8',
                  transition: 'border-color 0.12s',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#f97316'; e.currentTarget.style.background = '#fff'; }}
                onBlur={e => { e.currentTarget.style.borderColor = '#ede9e6'; e.currentTarget.style.background = '#faf9f8'; }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={cancel}
                style={{
                  padding: '7px 14px', borderRadius: '8px',
                  background: '#f7f5f3', border: '1px solid #ede9e6',
                  color: '#78716c', fontSize: '13px', fontWeight: 500,
                  cursor: 'pointer', transition: 'background 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f0ece9'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#f7f5f3'; }}
              >
                취소
              </button>
              <button
                onClick={addGroup}
                disabled={!newName.trim()}
                style={{
                  padding: '7px 16px', borderRadius: '8px',
                  background: newName.trim() ? '#f97316' : '#e8e3df',
                  color: newName.trim() ? '#fff' : '#b8afa8',
                  border: 'none', fontSize: '13px', fontWeight: 600,
                  cursor: newName.trim() ? 'pointer' : 'not-allowed',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { if (newName.trim()) e.currentTarget.style.background = '#c2410c'; }}
                onMouseLeave={e => { if (newName.trim()) e.currentTarget.style.background = '#f97316'; }}
              >
                만들기
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 그룹 목록 ── */}
      {groups.length === 0 && !isAdding ? (
        <div style={{ textAlign: 'center', padding: '80px 24px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#f7f5f3', border: '1px solid #ede9e6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <FolderOpen size={24} style={{ color: '#c4b5a5' }} />
          </div>
          <p style={{ fontSize: '15px', fontWeight: 600, color: '#44403c', marginBottom: '6px' }}>아직 그룹이 없어요</p>
          <p style={{ fontSize: '13px', color: '#a8a29e', marginBottom: '20px' }}>전략 그룹을 만들어 문서를 정리해보세요</p>
          <button
            onClick={() => setIsAdding(true)}
            style={{
              padding: '9px 18px', borderRadius: '9px',
              background: '#f97316', color: '#fff',
              border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#c2410c'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f97316'; }}
          >
            첫 번째 그룹 만들기
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
          {groups.map(group => {
            const { iconName, color } = parseGroupIcon(group.emoji);
            const GroupIcon  = getIconComponent(iconName);
            const colorCfg   = getColorConfig(color);
            const pickerShown = editPicker === group.id;

            return (
              <div key={group.id} style={{ position: 'relative' }} className="group-card">
                <button
                  onClick={() => router.push(`/strategy/${group.id}`)}
                  style={{
                    width: '100%', textAlign: 'left',
                    background: '#ffffff', border: '1px solid #ede9e6',
                    borderRadius: '14px', padding: '0',
                    cursor: 'pointer', overflow: 'hidden',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    transition: 'box-shadow 0.15s, transform 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.09)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  {/* 상단 컬러 스트립 */}
                  <div style={{ background: colorCfg.bg, borderBottom: `1px solid ${colorCfg.border}`, padding: '16px 16px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: colorCfg.border, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <GroupIcon size={18} style={{ color }} />
                    </div>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, opacity: 0.7 }} />
                  </div>
                  {/* 하단 정보 */}
                  <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: '#1c1917', marginBottom: '3px', letterSpacing: '-0.01em' }}>{group.name}</p>
                      <p style={{ fontSize: '11px', color: '#a8a29e' }}>{docCounts[group.id] ?? 0}개 페이지</p>
                    </div>
                    <ArrowRight size={14} style={{ color: '#c4b5a5', flexShrink: 0 }} />
                  </div>
                </button>

                {/* 아이콘 편집 버튼 (hover 시 노출) */}
                <div style={{ position: 'absolute', top: '10px', left: '10px' }}>
                  <button
                    onClick={e => { e.stopPropagation(); setEditPicker(pickerShown ? null : group.id); }}
                    className="icon-edit-btn"
                    style={{
                      width: '24px', height: '24px', borderRadius: '6px',
                      background: 'rgba(255,255,255,0.92)', border: '1px solid #ede9e6',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', opacity: 0, transition: 'opacity 0.15s, background 0.12s',
                      fontSize: '11px',
                    }}
                    title="아이콘 변경"
                    onMouseEnter={e => { e.currentTarget.style.background = '#f5f3f1'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.92)'; }}
                  >
                    ✏️
                  </button>
                  <AnimatePresence>
                    {pickerShown && (
                      <IconColorPicker
                        iconName={iconName}
                        color={color}
                        onChange={(icon, col) => { updateGroupIcon(group.id, icon, col); }}
                        onClose={() => setEditPicker(null)}
                      />
                    )}
                  </AnimatePresence>
                </div>

                {/* 삭제 버튼 */}
                <button
                  onClick={e => deleteGroup(group.id, e)}
                  style={{
                    position: 'absolute', top: '10px', right: '10px',
                    width: '24px', height: '24px', borderRadius: '6px',
                    background: 'rgba(255,255,255,0.9)', border: '1px solid #ede9e6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', opacity: 0, transition: 'opacity 0.15s, background 0.12s',
                  }}
                  className="delete-btn"
                  onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#fecaca'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.9)'; e.currentTarget.style.borderColor = '#ede9e6'; }}
                >
                  <Trash2 size={12} style={{ color: '#f87171' }} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .group-card:hover .delete-btn   { opacity: 1 !important; }
        .group-card:hover .icon-edit-btn { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
