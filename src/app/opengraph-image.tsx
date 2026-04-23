import { ImageResponse } from 'next/og';
import { readFile } from 'fs/promises';
import { join } from 'path';

export const runtime = 'nodejs';
export const alt = 'VIMO ERP';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 3600; // 1시간마다 재생성

export default async function Image() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  // 로고 이미지를 base64로 읽기
  const logoPath = join(process.cwd(), 'public', 'logo.png');
  const logoBuffer = await readFile(logoPath);
  const logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '48px',
          background: 'white',
        }}
      >
        {/* 비모 로고 */}
        <img
          src={logoBase64}
          width={220}
          height={177}
          style={{ objectFit: 'contain' }}
        />

        {/* 날짜 */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              fontSize: '36px',
              fontWeight: 800,
              color: '#a8a29e',
              letterSpacing: '0.06em',
              marginBottom: '-4px',
            }}
          >
            VIMO ERP
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span
              style={{
                fontSize: '80px',
                fontWeight: 900,
                color: '#1c1917',
                letterSpacing: '-0.04em',
              }}
            >
              {year}
            </span>
            <span style={{ fontSize: '48px', fontWeight: 700, color: '#d6d3d1' }}>
              .
            </span>
            <span
              style={{
                fontSize: '80px',
                fontWeight: 900,
                color: '#f97316',
                letterSpacing: '-0.04em',
              }}
            >
              {month}
            </span>
            <span style={{ fontSize: '48px', fontWeight: 700, color: '#d6d3d1' }}>
              .
            </span>
            <span
              style={{
                fontSize: '80px',
                fontWeight: 900,
                color: '#f97316',
                letterSpacing: '-0.04em',
              }}
            >
              {day}
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
