import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "비모 파트너",
  description: "비모 협력 스튜디오·프리랜서 워크스페이스",
  manifest: undefined,
  appleWebApp: undefined,
};

export default function PartnerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
