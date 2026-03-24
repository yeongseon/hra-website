/**
 * ======================================================
 * 루트 레이아웃 파일 (Root Layout)
 * ======================================================
 * 
 * 이 파일은 Next.js App Router에서 가장 중요한 파일입니다.
 * 여기서 정의한 HTML 구조와 스타일이 모든 페이지에 자동으로 적용됩니다.
 * 
 * 즉, 이 파일의 <html>과 <body> 태그로 모든 페이지 내용이 감싸집니다.
 * 사이트의 "뼈대"라고 생각하면 됩니다.
 * 
 * - 공통 폰트 설정
 * - 사이트 제목과 설명 (SEO, 브라우저 탭)
 * - 한국어 설정과 다크 테마 설정
 */

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// 폰트 설정: Google Fonts에서 제공하는 Geist 폰트를 로드합니다.
// CSS 변수로 등록하면 Tailwind CSS에서 font-family로 사용할 수 있습니다.
const geistSans = Geist({
  variable: "--font-geist-sans", // CSS 변수 이름: --font-geist-sans
  subsets: ["latin"], // 라틴 문자만 로드해 페이지 속도 향상
});

// 고정폭 폰트 (코드 같은 걸 표시할 때 사용)
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 메타데이터: 사이트의 제목과 설명을 정의합니다.
// 이 정보는:
// - 브라우저 탭에 표시됨
// - Google 검색 결과에 나타남 (SEO)
// - 카톡, 링크 공유할 때 미리보기로 표시됨
export const metadata: Metadata = {
  title: {
    default: "HRA - Human Renaissance Academy", // 기본 페이지 제목
    template: "%s | HRA", // 다른 페이지 제목 형식 (예: "공지사항 | HRA")
  },
  description: "인간 르네상스를 꿈꾸는 대학 연합 교육 프로그램",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko" // 한국어 사이트임을 명시 (검색 엔진과 브라우저가 인식)
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
      // className 설명:
      // - ${geistSans.variable}: 앞서 정의한 Sans 폰트 CSS 변수 적용
      // - ${geistMono.variable}: 고정폭 폰트 CSS 변수 적용
      // - h-full: HTML 높이를 100%로 설정 (Tailwind CSS 클래스)
      // - antialiased: 텍스트를 부드럽게 표시
      // - dark: 다크 테마 활성화 (어두운 배경)
    >
      <body className="min-h-full flex flex-col">{children}</body>
      {/* 
        <body>: 웹페이지의 실제 내용이 들어가는 곳
        className="min-h-full flex flex-col":
        - min-h-full: 최소 높이를 화면 전체로 설정
        - flex flex-col: Flexbox로 세로 배열
        {children}: 각 페이지의 실제 콘텐츠가 여기 들어갑니다
      */}
    </html>
  );
}
