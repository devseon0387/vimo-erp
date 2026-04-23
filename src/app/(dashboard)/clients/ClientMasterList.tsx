'use client';

import { Search, X, Plus, AlertCircle, Building2, User } from 'lucide-react';
import type { Client } from '@/types';

export type ClientGroupStatus = 'active' | 'standby' | 'dormant' | 'inactive';

export const STATUS_LABEL: Record<ClientGroupStatus, string> = {
  active: '활성',
  standby: '대기',
  dormant: '휴면',
  inactive: '비활성',
};

export function isCorporateClient(client: Pick<Client, 'company'>): boolean {
  return Boolean(client.company && client.company.trim().length > 0);
}

export interface EnrichedClient extends Client {
  computedStatus: ClientGroupStatus;
  needsContact: boolean;
  projectCount: number;
  activeProjectCount: number;
  totalRevenue: number;
  lastContactDays: number | null;
}

interface Props {
  clients: EnrichedClient[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  searchQuery: string;
  onSearch: (q: string) => void;
  onAdd: () => void;
}

function Avatar({
  corporate,
  color,
  size = 28,
}: {
  corporate: boolean;
  color?: string;
  size?: number;
}) {
  const bg = color ?? (corporate
    ? 'linear-gradient(135deg, #60a5fa, #2563eb)'
    : 'linear-gradient(135deg, var(--color-brand-400), var(--color-brand-600))');
  const Icon = corporate ? Building2 : User;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size >= 40 ? 12 : 8,
        background: bg,
      }}
      className="shrink-0 text-white inline-flex items-center justify-center select-none"
      title={corporate ? '기업' : '개인'}
    >
      <Icon size={Math.round(size * 0.55)} strokeWidth={2.2} />
    </div>
  );
}

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center justify-between" style={{ color: 'var(--color-ink-400)' }}>
      <span>{label}</span>
      <span>{count}</span>
    </div>
  );
}

const STATUS_CHIP: Record<ClientGroupStatus, { bg: string; fg: string; label: string }> = {
  active:   { bg: 'var(--color-ok-50)',    fg: 'var(--color-ok-600)',    label: '활성' },
  standby:  { bg: '#eff6ff',                fg: '#1d4ed8',                label: '대기' },
  dormant:  { bg: 'var(--color-warn-50)',  fg: '#b45309',                label: '휴면' },
  inactive: { bg: 'var(--color-ink-100)',  fg: 'var(--color-ink-600)',   label: '비활성' },
};

function StatusDot({ status }: { status: ClientGroupStatus }) {
  const { fg } = STATUS_CHIP[status];
  return <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: fg }} />;
}

function MasterRow({
  client,
  active,
  onClick,
}: {
  client: EnrichedClient;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-3 py-2.5 rounded-lg flex items-center gap-2.5 text-left transition-colors ${
        active ? 'border' : 'hover:bg-[var(--color-ink-100)] border border-transparent'
      }`}
      style={active ? { background: 'var(--color-brand-50)', borderColor: 'var(--color-brand-400)' } : undefined}
    >
      <Avatar corporate={isCorporateClient(client)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <StatusDot status={client.computedStatus} />
          <div className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--color-ink-900)' }}>
            {client.name}
          </div>
        </div>
        <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--color-ink-400)' }}>
          {client.activeProjectCount > 0
            ? `${client.activeProjectCount} 프로젝트 진행`
            : client.projectCount > 0
            ? `총 ${client.projectCount}건`
            : '신규'}
        </div>
      </div>
      {client.needsContact && (
        <AlertCircle size={14} className="shrink-0" style={{ color: '#b45309' }} />
      )}
    </button>
  );
}

export function ClientMasterList({ clients, selectedId, onSelect, searchQuery, onSearch, onAdd }: Props) {
  const groups: Record<ClientGroupStatus, EnrichedClient[]> = {
    active: [],
    standby: [],
    dormant: [],
    inactive: [],
  };
  clients.forEach((c) => groups[c.computedStatus].push(c));

  const total = clients.length;

  return (
    <div
      className="flex flex-col gap-2 p-2 h-full overflow-hidden"
      style={{ background: 'white', border: '1px solid var(--color-ink-200)', borderRadius: 12 }}
    >
      {/* 검색 + 새 추가 */}
      <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1">
        <div
          className="flex-1 flex items-center gap-2 rounded-lg px-2.5 py-1.5"
          style={{ background: 'var(--color-ink-100)' }}
        >
          <Search size={13} style={{ color: 'var(--color-ink-400)' }} />
          <input
            type="text"
            placeholder="검색..."
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            className="flex-1 bg-transparent focus:outline-none text-[12.5px]"
            style={{ color: 'var(--color-ink-700)' }}
          />
          {searchQuery && (
            <button onClick={() => onSearch('')} style={{ color: 'var(--color-ink-400)' }}>
              <X size={13} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-white"
          style={{ background: 'var(--color-brand-500)' }}
          title="새 클라이언트"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* 리스트 */}
      <style jsx>{`
        .clients-scroll {
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
          scrollbar-width: thin;
          scrollbar-color: var(--color-ink-300) transparent;
          scroll-behavior: smooth;
        }
        .clients-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .clients-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .clients-scroll::-webkit-scrollbar-thumb {
          background: var(--color-ink-200);
          border-radius: 10px;
          border: 1px solid transparent;
          background-clip: padding-box;
        }
        .clients-scroll::-webkit-scrollbar-thumb:hover {
          background: var(--color-ink-300);
          background-clip: padding-box;
        }
      `}</style>
      <div className="flex-1 overflow-y-auto space-y-0.5 pb-2 clients-scroll">
        {total === 0 ? (
          <div className="px-3 py-10 text-center text-[12px]" style={{ color: 'var(--color-ink-400)' }}>
            {searchQuery ? '검색 결과 없음' : '클라이언트가 없어요'}
          </div>
        ) : (
          <>
            {groups.active.length > 0 && (
              <>
                <GroupHeader label="활성" count={groups.active.length} />
                {groups.active.map((c) => (
                  <MasterRow key={c.id} client={c} active={c.id === selectedId} onClick={() => onSelect(c.id)} />
                ))}
              </>
            )}
            {groups.standby.length > 0 && (
              <>
                <GroupHeader label="대기" count={groups.standby.length} />
                {groups.standby.map((c) => (
                  <MasterRow key={c.id} client={c} active={c.id === selectedId} onClick={() => onSelect(c.id)} />
                ))}
              </>
            )}
            {groups.dormant.length > 0 && (
              <>
                <GroupHeader label="휴면" count={groups.dormant.length} />
                {groups.dormant.map((c) => (
                  <MasterRow key={c.id} client={c} active={c.id === selectedId} onClick={() => onSelect(c.id)} />
                ))}
              </>
            )}
            {groups.inactive.length > 0 && (
              <>
                <GroupHeader label="비활성" count={groups.inactive.length} />
                {groups.inactive.map((c) => (
                  <MasterRow key={c.id} client={c} active={c.id === selectedId} onClick={() => onSelect(c.id)} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
