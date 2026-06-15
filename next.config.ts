import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  compress: true,
  // 배럴 import(lucide-react 76파일·framer-motion 39파일)를 실제 사용 심볼만 포함하도록 자동 deep-import 변환.
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // 마케팅 섹션 → 문의 도메인으로 통합 (2026-05-24)
      { source: '/marketing',               destination: '/inquiries',           permanent: true },
      { source: '/marketing/inquiries',     destination: '/inquiries?tab=all',   permanent: true },
      { source: '/marketing/portfolio',     destination: '/inquiries/portfolio', permanent: true },
    ];
  },
};

export default nextConfig;
