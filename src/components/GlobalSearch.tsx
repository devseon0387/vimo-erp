'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, FileText, Users, Briefcase, FolderOpen } from 'lucide-react';
import { getPartners, getClients as fetchClients, getProjects } from '@/lib/supabase/db/cached';
import { Partner, Client, Project } from '@/types';

interface SearchResult {
  id: string;
  title: string;
  type: 'partner' | 'client' | 'project';
  subtitle?: string;
  path: string;
}

export default function GlobalSearch() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [allPartners, setAllPartners] = useState<Partner[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 데이터 로드 (최초 1회)
  useEffect(() => {
    Promise.all([getPartners(), fetchClients(), getProjects()]).then(([p, c, pr]) => {
      setAllPartners(p);
      setAllClients(c);
      setAllProjects(pr);
    });
  }, []);

  // 검색 로직
  useEffect(() => {
    if (query.trim() === '') {
      setResults([]);
      return;
    }

    const searchQuery = query.toLowerCase();
    const allResults: SearchResult[] = [];

    // 파트너 검색
    allPartners.forEach(partner => {
      if (
        partner.name.toLowerCase().includes(searchQuery) ||
        (partner.company || '').toLowerCase().includes(searchQuery) ||
        (partner.email || '').toLowerCase().includes(searchQuery)
      ) {
        allResults.push({
          id: partner.id,
          title: partner.name,
          type: 'partner',
          subtitle: partner.company,
          path: '/partners',
        });
      }
    });

    // 클라이언트 검색
    allClients.forEach(client => {
      if (
        client.name.toLowerCase().includes(searchQuery) ||
        (client.contactPerson || '').toLowerCase().includes(searchQuery) ||
        (client.email || '').toLowerCase().includes(searchQuery)
      ) {
        allResults.push({
          id: client.id,
          title: client.name,
          type: 'client',
          subtitle: client.contactPerson,
          path: `/clients/${client.id}`,
        });
      }
    });

    // 프로젝트 검색
    allProjects.forEach(project => {
      if (
        project.title.toLowerCase().includes(searchQuery) ||
        (project.client || '').toLowerCase().includes(searchQuery)
      ) {
        allResults.push({
          id: project.id,
          title: project.title,
          type: 'project',
          subtitle: project.client,
          path: `/projects/${project.id}`,
        });
      }
    });

    setResults(allResults.slice(0, 8));
    setSelectedIndex(0);
  }, [query, allPartners, allClients, allProjects]);

  // 검색창 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsHovered(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 키보드 단축키 (Cmd+K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsHovered(true);
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 100);
      }

      if (e.key === 'Escape') {
        setIsOpen(false);
        setQuery('');
        setIsHovered(false);
      }

      if (isOpen && results.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % results.length);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (results[selectedIndex]) {
            handleResultClick(results[selectedIndex]);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex]);

  const handleResultClick = (result: SearchResult) => {
    router.push(result.path);
    setIsOpen(false);
    setQuery('');
    setIsHovered(false);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'partner':
        return <Users size={22} className="text-orange-500" />;
      case 'client':
        return <Briefcase size={22} className="text-green-500" />;
      case 'project':
        return <FolderOpen size={22} className="text-orange-500" />;
      default:
        return <FileText size={22} className="text-gray-500" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'partner':
        return '파트너';
      case 'client':
        return '클라이언트';
      case 'project':
        return '프로젝트';
      default:
        return '';
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        if (!isOpen) setIsHovered(false);
      }}
      className="relative h-12 flex items-center"
    >
      {/* 검색 힌트 아이콘 - 호버하지 않을 때 */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 transition-all duration-300 ease-out ${
          !isHovered && !isOpen
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-75 pointer-events-none'
        }`}
      >
        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-orange-400 to-orange-400 flex items-center justify-center shadow-md">
          <Search size={20} className="text-white" />
        </div>
      </div>

      {/* 검색 버튼 - 호버 시 확장 */}
      <div
        ref={searchRef}
        className={`absolute inset-0 transition-all duration-300 ease-out ${
          isHovered || isOpen
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-2 scale-95 pointer-events-none'
        }`}
      >
        <button
          onClick={() => {
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 100);
          }}
          className="w-full flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-orange-50 to-orange-50 hover:from-orange-100 hover:to-orange-100 border border-orange-200 rounded-lg transition-all group shadow-lg hover:shadow-xl"
        >
          <Search size={18} className="text-orange-500 group-hover:text-orange-600" />
          <span className="text-sm text-gray-700 flex-1 text-left font-medium">검색...</span>
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 bg-white border border-orange-200 rounded text-xs text-orange-600 font-semibold">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* 검색 모달 */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[5vh] sm:pt-[10vh] px-2 sm:px-4">
          {/* 배경 오버레이 */}
          <div
            className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => {
              setIsOpen(false);
              setQuery('');
              setIsHovered(false);
            }}
          />

          {/* 모달 컨텐츠 */}
          <div className="relative w-full max-w-2xl bg-white rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-top-4 duration-200">
            {/* 검색 입력 */}
            <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 sm:py-5 border-b border-divider bg-gradient-to-r from-orange-50 to-orange-50">
              <Search size={20} className="text-orange-500 flex-shrink-0 sm:w-6 sm:h-6" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="파트너, 클라이언트, 프로젝트 검색..."
                className="flex-1 outline-none text-base sm:text-lg text-gray-900 placeholder-gray-400 bg-transparent font-medium"
                autoFocus
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={20} />
                </button>
              )}
              <button
                onClick={() => {
                  setIsOpen(false);
                  setQuery('');
                  setIsHovered(false);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <kbd className="px-2 py-1 bg-white border border-gray-300 rounded text-xs text-gray-600">ESC</kbd>
              </button>
            </div>

            {/* 검색 결과 */}
            <div className="max-h-[60vh] sm:max-h-[60vh] overflow-y-auto">
            {query === '' ? (
              <div className="p-8 sm:p-12 text-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 rounded-full bg-gradient-to-r from-orange-100 to-orange-100 flex items-center justify-center">
                  <Search size={32} className="text-orange-500 sm:w-10 sm:h-10" />
                </div>
                <p className="text-base sm:text-lg font-medium text-gray-700 mb-2">무엇을 찾으시나요?</p>
                <p className="text-sm text-gray-500">파트너, 클라이언트, 프로젝트를 빠르게 검색하세요</p>
                <div className="mt-4 sm:mt-6 flex items-center justify-center gap-3 sm:gap-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 sm:px-2 py-1 bg-gray-100 rounded text-xs">↑↓</kbd>
                    이동
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 sm:px-2 py-1 bg-gray-100 rounded text-xs">Enter</kbd>
                    선택
                  </span>
                </div>
              </div>
            ) : results.length === 0 ? (
              <div className="p-8 sm:p-12 text-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 rounded-full bg-gray-100 flex items-center justify-center">
                  <Search size={32} className="text-gray-300 sm:w-10 sm:h-10" />
                </div>
                <p className="text-base sm:text-lg font-medium text-gray-700 mb-2">검색 결과가 없습니다</p>
                <p className="text-sm text-gray-500">&quot;{query}&quot;에 대한 결과를 찾을 수 없습니다</p>
              </div>
            ) : (
              <div className="py-2 sm:py-3">
                {results.map((result, index) => (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => handleResultClick(result)}
                    className={`w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3 sm:py-4 transition-all ${
                      index === selectedIndex
                        ? 'bg-gradient-to-r from-orange-50 to-orange-50 border-l-4 border-orange-500'
                        : 'hover:bg-gray-50 border-l-4 border-transparent'
                    }`}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-white shadow-sm flex items-center justify-center">
                      {getIcon(result.type)}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm sm:text-base font-semibold text-gray-900 truncate mb-0.5 sm:mb-1">
                        {result.title}
                      </p>
                      {result.subtitle && (
                        <p className="text-xs sm:text-sm text-gray-500 truncate">
                          {result.subtitle}
                        </p>
                      )}
                    </div>
                    <span className="text-xs font-medium text-gray-500 bg-white px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border border-divider whitespace-nowrap">
                      {getTypeLabel(result.type)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 푸터 - 단축키 안내 */}
          {results.length > 0 && (
            <div className="px-4 sm:px-6 py-2.5 sm:py-3 border-t border-divider bg-gradient-to-r from-gray-50 to-gray-100 flex items-center justify-between">
              <div className="hidden sm:flex items-center gap-6 text-xs text-gray-600">
                <span className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-white border border-gray-300 rounded font-mono">↑↓</kbd>
                  <span className="font-medium">이동</span>
                </span>
                <span className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-white border border-gray-300 rounded font-mono">Enter</kbd>
                  <span className="font-medium">선택</span>
                </span>
              </div>
              <div className="text-xs text-gray-500 sm:ml-auto">
                {results.length}개 결과
              </div>
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
