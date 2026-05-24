import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "비모 파트너",
  description: "비모 협력 스튜디오·프리랜서 워크스페이스. 하나의 계정으로 비박스, 비모 파트너 ERP 등 모든 파트너 서비스를 사용합니다.",
  metadataBase: new URL('https://partner.vi-mo.kr'),
  manifest: undefined,
  appleWebApp: undefined,
  openGraph: {
    title: "비모 파트너",
    description: "비모와 함께하는 협력 스튜디오·프리랜서 전용 워크스페이스",
    url: 'https://partner.vi-mo.kr',
    siteName: '비모 파트너',
    type: 'website',
  },
};

export default function PartnerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
