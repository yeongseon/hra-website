/**
 * 공개 페이지 레이아웃 (src/app/(public)/layout.tsx)
 * 
 * (public) 폴더의 모든 페이지에 공통으로 적용되는 레이아웃입니다.
 * - 헤더(메뉴바) 상단 표시 + 로그인 상태 전달
 * - 푸터(하단) 표시
 * - 각 페이지 내용은 main 태그에 표시됨
 * 로그인이 필요 없는 공개 페이지들을 감싼 wrapper 역할
 */

import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { auth } from "@/lib/auth";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 서버에서 현재 로그인 세션을 가져옵니다.
  // 로그인하지 않았으면 null, 로그인했으면 사용자 정보가 들어있습니다.
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col bg-white text-gray-900">
      {/* 상단 헤더(메뉴) — 로그인 상태를 전달하여 로그인/로그아웃 버튼 표시 */}
      <Header session={session} />
      {/* 각 페이지의 실제 내용이 여기에 표시됨 */}
      <main className="flex-1 pt-16">{children}</main>
      {/* 하단 푸터 */}
      <Footer />
    </div>
  );
}
