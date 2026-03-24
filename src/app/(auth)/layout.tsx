/**
 * 인증 페이지 레이아웃 (로그인, 회원가입)
 * - 모든 인증 관련 페이지가 이 레이아웃을 공유합니다
 * - 검은색 배경 스타일과 가운데 정렬을 적용합니다
 * - children: 로그인 페이지나 회원가입 페이지 같은 내용이 여기에 들어옵니다
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // 화면 전체를 차지하는 검은 배경 컨테이너 (min-h-screen = 최소 높이 100vh)
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 flex items-center justify-center p-4">
      {/* 최대 너비를 md(448px)로 제한하여 모바일에서 좋아 보이도록 함 */}
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
