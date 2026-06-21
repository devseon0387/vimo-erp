'use client';
/**
 * ★ 클라이언트 전용 캐시 래퍼 — 반드시 'use client'.
 *   서버 컴포넌트 / route handler / MCP / 크론에서 import 금지.
 *   서버 트리에 끌려가면 cache.ts의 모듈 Map(store)이 "서버 프로세스 전역 = 전 사용자 공유"가 되어
 *   권한 누수(다른 계정 데이터 노출)가 된다. 여기서만(브라우저 메모리) cachedFetch로 'use server' DAL을 감싼다.
 *
 * 키 규칙: cache.ts의 TABLE_PREFIX와 prefix 일치 필수 — projects: / partners: / clients: / episodes:
 *   그래야 useSupabaseRealtime → invalidateTable(table) → invalidatePrefix(prefix)가 키를 비운다.
 *
 * 자기변경 즉시 반영: 쓰기(서버액션)는 캐시와 무관하므로, 쓰기 핸들러에서
 *   invalidateTable('episodes'|'projects'|...) 호출 후 재조회(loadData)해야 방금 저장한 값이 바로 보인다.
 *
 * 다계정 누수 방지: episodes:all 등은 사용자(팀/파트너)에 따라 결과가 다르므로,
 *   로그인/로그아웃 양방향에서 invalidateAll()로 모듈 캐시를 비운다(login/page.tsx, layout.tsx).
 */
import { cachedFetch } from '@/lib/supabase/cache';
import {
  getProjects as _getProjects,
  getPartners as _getPartners,
  getClients as _getClients,
  getAllEpisodes as _getAllEpisodes,
} from '@/lib/supabase/db';

// 자주 안 바뀜 → 기본 30s TTL (페이지 이동/재방문 시 재요청 제거 효과 큼)
export const getProjects = () => cachedFetch('projects:all', _getProjects);
export const getPartners = () => cachedFetch('partners:all', _getPartners);
export const getClients = () => cachedFetch('clients:all', _getClients);

// 자주 변경 → 짧은 TTL(10s). 자기변경 즉시 반영은 쓰기 후 invalidateTable('episodes')로 보장.
export const getAllEpisodes = () => cachedFetch('episodes:all', _getAllEpisodes, 10_000);
