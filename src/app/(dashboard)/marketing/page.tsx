'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Video,
  Eye,
  EyeOff,
  CheckCircle,
  ExternalLink,
  Plus,
  User,
  Calendar,
  Users,
  MessageSquare,
} from 'lucide-react';
import Link from 'next/link';
import { Project, PortfolioItem, Client, Inquiry } from '@/types';
import { getProjects, getPortfolioItems, getClients, getInquiries } from '@/lib/supabase/db';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';

export default function MarketingPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [p, pf, c, inq] = await Promise.all([
      getProjects(),
      getPortfolioItems(),
      getClients(),
      getInquiries(),
    ]);
    setProjects(p);
    setPortfolioItems(pf);
    setClients(c);
    setInquiries(inq);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useSupabaseRealtime(['portfolio_items'], loadData);

  const completedProjects = projects.filter(p => p.status === 'completed');
  const publishedPortfolio = portfolioItems.filter(p => p.isPublished);
  const unpublishedPortfolio = portfolioItems.filter(p => !p.isPublished);

  // 클라이언트별 프로젝트 현황
  const clientSummary = clients
    .map(client => ({
      ...client,
      projectCount: projects.filter(p => p.clientId === client.id || p.client === client.name).length,
      completedCount: projects.filter(p => (p.clientId === client.id || p.client === client.name) && p.status === 'completed').length,
    }))
    .filter(c => c.projectCount > 0)
    .sort((a, b) => b.projectCount - a.projectCount);

  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">마케팅</h1>
          <p className="text-gray-500 mt-2">포트폴리오 관리 및 마케팅 자료</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/marketing/inquiries"
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium flex items-center gap-2"
          >
            <MessageSquare size={18} />
            문의 관리
          </Link>
          <Link
            href="/marketing/portfolio"
            className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium flex items-center gap-2"
          >
            <Plus size={20} />
            포트폴리오 추가
          </Link>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-600">완료 프로젝트</p>
            <div className="p-2 bg-green-100 rounded-full">
              <CheckCircle className="text-green-500" size={20} />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {loading ? '-' : completedProjects.length}
            <span className="text-lg font-normal text-gray-600 ml-1">개</span>
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-600">포트폴리오</p>
            <div className="p-2 bg-orange-100 rounded-full">
              <Video className="text-orange-500" size={20} />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {loading ? '-' : portfolioItems.length}
            <span className="text-lg font-normal text-gray-600 ml-1">개</span>
          </p>
          {!loading && (
            <p className="text-xs text-gray-500 mt-1">
              공개 {publishedPortfolio.length} / 비공개 {unpublishedPortfolio.length}
            </p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-600">클라이언트</p>
            <div className="p-2 bg-orange-100 rounded-full">
              <Users className="text-orange-500" size={20} />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {loading ? '-' : clients.filter(c => c.status === 'active').length}
            <span className="text-lg font-normal text-gray-600 ml-1">개</span>
          </p>
        </div>

        <Link href="/marketing/inquiries" className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-600">문의</p>
            <div className="p-2 bg-blue-100 rounded-full">
              <MessageSquare className="text-blue-500" size={20} />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {loading ? '-' : inquiries.length}
            <span className="text-lg font-normal text-gray-600 ml-1">건</span>
          </p>
          {!loading && (
            <p className="text-xs text-gray-500 mt-1">
              새 문의 {inquiries.filter(i => i.status === 'new').length}건
            </p>
          )}
        </Link>
      </div>

      {/* 포트폴리오 섹션 */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-divider flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">포트폴리오</h2>
            <p className="text-sm text-gray-500 mt-1">등록된 포트폴리오 항목</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm font-medium">
              {portfolioItems.length}개
            </span>
            <Link
              href="/marketing/portfolio"
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium flex items-center gap-2"
            >
              포트폴리오 관리
              <ExternalLink size={14} />
            </Link>
          </div>
        </div>
        <div className="divide-y divide-gray-200">
          {loading ? (
            <div className="p-8 text-center text-gray-500">로딩 중...</div>
          ) : portfolioItems.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Video className="mx-auto mb-3 text-gray-400" size={48} />
              <p className="text-lg font-medium">포트폴리오가 없습니다</p>
              <p className="text-sm mt-1">포트폴리오 관리 페이지에서 작업물을 추가하세요</p>
            </div>
          ) : (
            portfolioItems.slice(0, 5).map((item) => (
              <div key={item.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
                      {item.isPublished ? (
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium flex items-center gap-1">
                          <Eye size={11} />
                          공개
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-medium flex items-center gap-1">
                          <EyeOff size={11} />
                          비공개
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-sm text-gray-600 mb-3 line-clamp-1">{item.description}</p>
                    )}
                    <div className="flex items-center gap-6 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <User size={12} />
                        <span>{item.client}</span>
                      </div>
                      {item.completedAt && (
                        <div className="flex items-center gap-1">
                          <Calendar size={12} />
                          <span>{new Date(item.completedAt).toLocaleDateString('ko-KR')}</span>
                        </div>
                      )}
                    </div>
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex gap-2 mt-3">
                        {item.tags.slice(0, 4).map((tag) => (
                          <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <a
                    href={item.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-6 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium flex items-center gap-2"
                  >
                    <ExternalLink size={14} />
                    YouTube
                  </a>
                </div>
              </div>
            ))
          )}
          {!loading && portfolioItems.length > 5 && (
            <div className="p-4 text-center">
              <Link href="/marketing/portfolio" className="text-sm text-orange-600 hover:text-orange-700 font-medium">
                전체 {portfolioItems.length}개 보기 →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* 클라이언트별 현황 */}
      {!loading && clientSummary.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-divider">
            <div className="flex items-center gap-2">
              <Users className="text-orange-500" size={20} />
              <h2 className="text-lg font-semibold text-gray-900">클라이언트별 현황</h2>
            </div>
          </div>
          <div className="divide-y divide-gray-200">
            {clientSummary.map((client) => (
              <div key={client.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{client.name}</h3>
                    {client.contactPerson && (
                      <p className="text-sm text-gray-500 mt-0.5">담당: {client.contactPerson}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-6 text-sm text-gray-600">
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-1">전체 프로젝트</p>
                      <p className="text-xl font-bold text-gray-900">{client.projectCount}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-1">완료</p>
                      <p className="text-xl font-bold text-green-600">{client.completedCount}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
