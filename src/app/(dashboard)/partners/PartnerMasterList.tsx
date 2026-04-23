'use client';

import { Search, X, Plus, AlertCircle, User, Briefcase } from 'lucide-react';
import type { Partner } from '@/types';

export type PartnerGroupStatus = 'active' | 'standby' | 'dormant' | 'inactive';

export const PARTNER_STATUS_LABEL: Record<PartnerGroupStatus, string> = {
  active: '활성',
  standby: '대기',
  dormant: '휴면',
  inactive: '비활성',
};

export function isBusinessPartner(partner: Pick<Partner, 'partnerType'>): boolean {
  return partner.partnerType === 'business';
}

export interface EnrichedPartner extends Partner {
  computedStatus: PartnerGroupStatus;
  needsContact: boolean;
  projectCount: number;
  activeEpisodeCount: number;
  totalRevenue: number;
  thisMonthRevenue: number;
  lastActivityDays: number | null;
}

interface Props {
  partners: EnrichedPartner[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  searchQuery: string;
  onSearch: (q: string) => void;
  onAdd: () => void;
}

function Avatar({
  business,
  inactive = false,
  size = 28,
}: {
  business: boolean;
  inactive?: boolean;
  size?: number;
}) {
  const bg = inactive
    ? 'linear-gradient(135deg, #d6d3d1, #a8a29e)'
    : business
      ? 'linear-gradient(135deg, #60a5fa, #2563eb)'
      : 'linear-gradient(135deg, var(--color-brand-400), var(--color-brand-600))';
  const Icon = business ? Briefcase : User;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size >= 40 ? 12 : 8,
        background: bg,
      }}
      className="shrink-0 text-white inline-flex items-center justify-center select-none"
      title={business ? '사업자' : '프리랜서'}
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

const STATUS_CHIP: Record<PartnerGroupStatus, { fg: string }> = {
  active:   { fg: 'var(--color-ok-600)' },
  standby:  { fg: '#1d4ed8' },
  dormant:  { fg: '#b45309' },
  inactive: { fg: 'var(--color-ink-600)' },
};

function StatusDot({ status }: { status: PartnerGroupStatus }) {
  return <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: STATUS_CHIP[status].fg }} />;
}

function MasterRow({
  partner,
  active,
  onClick,
}: {
  partner: EnrichedPartner;
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
      <Avatar business={isBusinessPartner(partner)} inactive={partner.computedStatus === 'inactive'} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <StatusDot status={partner.computedStatus} />
          <div className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--color-ink-900)' }}>
            {partner.name}
          </div>
          {partner.generation && (
            <span className="text-[10px] px-1 rounded" style={{ background: 'var(--color-ink-100)', color: 'var(--color-ink-500)' }}>
              {partner.generation}기
            </span>
          )}
        </div>
        <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--color-ink-400)' }}>
          {partner.activeEpisodeCount > 0
            ? `${partner.activeEpisodeCount} 회차 진행`
            : partner.projectCount > 0
            ? `프로젝트 ${partner.projectCount}건`
            : '신규'}
        </div>
      </div>
      {partner.needsContact && (
        <AlertCircle size={14} className="shrink-0" style={{ color: '#b45309' }} />
      )}
    </button>
  );
}

export function PartnerMasterList({ partners, selectedId, onSelect, searchQuery, onSearch, onAdd }: Props) {
  const groups: Record<PartnerGroupStatus, EnrichedPartner[]> = {
    active: [],
    standby: [],
    dormant: [],
    inactive: [],
  };
  partners.forEach((p) => groups[p.computedStatus].push(p));

  const total = partners.length;

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
          title="새 파트너"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* 리스트 */}
      <style jsx>{`
        .partners-scroll {
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
          scrollbar-width: thin;
          scrollbar-color: var(--color-ink-300) transparent;
          scroll-behavior: smooth;
        }
        .partners-scroll::-webkit-scrollbar { width: 6px; }
        .partners-scroll::-webkit-scrollbar-track { background: transparent; }
        .partners-scroll::-webkit-scrollbar-thumb {
          background: var(--color-ink-200);
          border-radius: 10px;
          background-clip: padding-box;
        }
        .partners-scroll::-webkit-scrollbar-thumb:hover {
          background: var(--color-ink-300);
          background-clip: padding-box;
        }
      `}</style>
      <div className="flex-1 overflow-y-auto space-y-0.5 pb-2 partners-scroll">
        {total === 0 ? (
          <div className="px-3 py-10 text-center text-[12px]" style={{ color: 'var(--color-ink-400)' }}>
            {searchQuery ? '검색 결과 없음' : '파트너가 없어요'}
          </div>
        ) : (
          <>
            {groups.active.length > 0 && (
              <>
                <GroupHeader label="활성" count={groups.active.length} />
                {groups.active.map((p) => (
                  <MasterRow key={p.id} partner={p} active={p.id === selectedId} onClick={() => onSelect(p.id)} />
                ))}
              </>
            )}
            {groups.standby.length > 0 && (
              <>
                <GroupHeader label="대기" count={groups.standby.length} />
                {groups.standby.map((p) => (
                  <MasterRow key={p.id} partner={p} active={p.id === selectedId} onClick={() => onSelect(p.id)} />
                ))}
              </>
            )}
            {groups.dormant.length > 0 && (
              <>
                <GroupHeader label="휴면" count={groups.dormant.length} />
                {groups.dormant.map((p) => (
                  <MasterRow key={p.id} partner={p} active={p.id === selectedId} onClick={() => onSelect(p.id)} />
                ))}
              </>
            )}
            {groups.inactive.length > 0 && (
              <>
                <GroupHeader label="비활성" count={groups.inactive.length} />
                {groups.inactive.map((p) => (
                  <MasterRow key={p.id} partner={p} active={p.id === selectedId} onClick={() => onSelect(p.id)} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
