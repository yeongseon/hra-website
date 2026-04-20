import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

/**
 * 사이트 전역 메타데이터.
 *
 * - metadataBase: 환경변수 NEXT_PUBLIC_APP_URL 우선, 없으면 프로덕션 도메인 사용.
 *   상대 경로(/opengraph-image 등)를 절대 URL로 변환하는 기준점이 됩니다.
 * - openGraph / twitter: 카카오톡, 페이스북, 슬랙, 트위터 등 SNS에서
 *   링크를 공유했을 때 미리보기 카드를 제대로 노출하기 위한 설정입니다.
 * - 이미지는 src/app/opengraph-image.tsx 에서 Next.js ImageResponse 로
 *   1200x630 PNG 를 동적으로 생성합니다.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://hra-website-theta.vercel.app";

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
    title: siteName,
    description: siteDescription,
    url: siteUrl,
    siteName: "HRA",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description: siteDescription,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-inter)]">
        {children}
      </body>
    </html>
  );
}
