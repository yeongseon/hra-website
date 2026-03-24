/**
 * 회원 전용 페이지 레이아웃
 * 서버 컴포넌트: 로그인한 사용자만 접근 가능한 모든 페이지(수업일지 등)의 기본 레이아웃입니다
 * - 로그인하지 않은 사용자는 자동으로 로그인 페이지로 이동됩니다
 * - Header, Footer, 그리고 페이지 내용이 표시됩니다
 */
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * async 함수: 이 컴포넌트는 비동기 서버 컴포넌트입니다 (서버에서만 실행됨)
 * 서버에서 사용자 정보를 먼저 확인한 후, 안전하게 페이지를 렌더링할 수 있습니다
 */
export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // auth(): NextAuth가 제공하는 함수 - 현재 로그인한 사용자 정보를 서버에서 가져옴
  // 서버에서 실행되므로 비밀번호 같은 민감한 정보도 안전하게 확인 가능
  const session = await auth();

  // 만약 로그인하지 않았다면 (session?.user가 없다면)
  if (!session?.user) {
    // redirect(): 사용자를 강제로 로그인 페이지로 이동시킴
    // 이렇게 하면 회원 전용 페이지에 접근하려는 사람들이 로그인하도록 유도
    redirect("/login");
  }

  return (
    // 화면 전체를 차지하는 검은색 배경의 플렉스 컨테이너
    // min-h-screen: 최소 높이 100vh (화면 전체 높이)
    // flex-col: 자식 요소들이 세로로 정렬됨
    <div className="flex min-h-screen flex-col bg-black text-white">
      {/* 페이지 맨 위에 네비게이션 바 표시 */}
      <Header />
      {/* main: 페이지의 주요 내용 영역
          flex-1: 중간 공간을 최대한 활용해 Header와 Footer 사이를 채움
          pt-16: 상단 패딩 추가 (헤더 아래 공간)
      */}
      <main className="flex-1 pt-16">{children}</main>
      {/* 페이지 맨 아래 푸터 표시 */}
      <Footer />
    </div>
  );
}
