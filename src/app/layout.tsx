import type { Metadata } from "next";
import "./globals.css";

/**
 * 사이트 전역 메타데이터.
 *
 * - metadataBase: Vercel 시스템 환경변수를 우선 사용하고,
 *   로컬 개발에서는 localhost, 그 외 프로덕션 환경에서는 실제 서비스 도메인을 사용합니다.
 *   상대 경로(/opengraph-image 등)를 절대 URL로 변환하는 기준점이 됩니다.
 * - openGraph / twitter: 카카오톡, 페이스북, 슬랙, 트위터 등 SNS에서
 *   링크를 공유했을 때 미리보기 카드를 제대로 노출하기 위한 공통 설정입니다.
 *   제목/설명은 각 페이지의 metadata.title / description 을 그대로 상속받습니다.
 * - 이미지는 src/app/opengraph-image.tsx 에서 Next.js ImageResponse 로
 *   1200x630 PNG 를 동적으로 생성합니다.
 */
const siteUrl = (() => {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return process.env.NODE_ENV === "production"
    ? "https://hra-website-theta.vercel.app"
    : process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
})();

const siteName = "HRA - Human Renaissance Academy";
const siteDescription = "인간 르네상스를 꿈꾸는 대학 연합 교육 프로그램";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: "%s | HRA",
  },
  description: siteDescription,
  openGraph: {
    siteName: "HRA",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
