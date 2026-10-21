/**
 * 회원 전용 페이지 레이아웃
 * 서버 컴포넌트: 로그인한 사용자만 접근 가능한 모든 페이지(수업일지 등)의 기본 레이아웃입니다
 * - 로그인하지 않은 사용자는 로그인 페이지로, 승인 대기 사용자는 대기 페이지로 이동됩니다
 * - Header, Footer, 그리고 페이지 내용이 표시됩니다
 */
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { requireMember } from "@/lib/member";

// 회원 전용 페이지는 사용자 세션에 따라 메뉴(자료실/관리자)가 달라지므로
// 정적 캐시가 아닌 매 요청마다 렌더링하도록 강제합니다.
export const dynamic = "force-dynamic";

/**
 * async 함수: 이 컴포넌트는 비동기 서버 컴포넌트입니다 (서버에서만 실행됨)
 * 서버에서 사용자 정보를 먼저 확인한 후, 안전하게 페이지를 렌더링할 수 있습니다
 */
export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 레이아웃에서도 승인 역할을 검사해 승인 대기 사용자를 /pending 으로 이동시킨다.
  const session = await requireMember();

  return (
    // 화면 전체를 차지하는 검은색 배경의 플렉스 컨테이너
    // min-h-screen: 최소 높이 100vh (화면 전체 높이)
    // flex-col: 자식 요소들이 세로로 정렬됨
    <div className="flex min-h-screen flex-col bg-white text-gray-900">
      {/* 페이지 맨 위에 네비게이션 바 표시 — 로그인 세션을 전달해야
          관리자/자료실 메뉴가 표시됩니다 (전달하지 않으면 비로그인 메뉴만 노출) */}
      {/* 회원 인가에 사용한 세션 전체 대신 헤더 표시용 필드만 전달합니다. */}
      <Header session={{
        user: { name: session.user.name, email: session.user.email, role: session.user.role },
      }} />
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
