/**
 * 헤더 컴포넌트 - 사이트 상단의 네비게이션 바
 *
 * 이 컴포넌트는 HRA 웹사이트의 맨 위에 표시되는 헤더를 만듭니다.
 * - 로고(HRA) 표시
 * - PC 화면에서는 가로로 네비게이션 링크 표시
 * - 모바일 화면에서는 메뉴 아이콘으로 햄버거 메뉴 제공
 * - 현재 페이지를 표시해주는 액티브 상태 관리
 * - 로그인/로그아웃 버튼 표시
 * - 역할(ADMIN/MEMBER)에 따라 추가 링크 표시
 *
 * "use client" = 이 컴포넌트는 클라이언트 컴포넌트입니다.
 * 클라이언트 컴포넌트는 사용자의 브라우저에서 실행되고,
 * 클릭이나 상태 변화 같은 상호작용을 처리할 수 있습니다.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, LogIn, LogOut, ChevronDown, User } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

/**
 * Session 타입 정의
 * 서버에서 전달받는 세션 정보의 타입입니다.
 * null이면 로그인하지 않은 상태입니다.
 */
type SessionUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: "ADMIN" | "MEMBER";
};

type HeaderProps = {
  session?: {
    user?: SessionUser;
  } | null;
};

/**
 * 네비게이션 링크 배열
 * 사이트의 주요 페이지들을 여기에 정의합니다.
 * 각 객체는 { href: "이동할 주소", label: "화면에 보여줄 텍스트" } 형태입니다.
 */
const navLinks = [
  { href: "/about", label: "소개" },
  { href: "/faculty", label: "교수진" },
  { href: "/curriculum", label: "커리큘럼" },
  { href: "/cohorts", label: "기수 소개" },
  { href: "/recruitment", label: "모집안내" },
  { href: "/notices", label: "공지사항" },
  { href: "/gallery", label: "갤러리" },
  { href: "/resources", label: "자료실" },
];

/**
 * Header 컴포넌트 - 헤더를 렌더링하는 함수
 * session prop으로 현재 로그인 상태를 받아옵니다.
 */
export function Header({ session }: HeaderProps) {
  // 현재 페이지의 URL 경로를 가져옵니다. (예: "/recruitment")
  // 이를 통해 어느 네비게이션 링크가 활성화되었는지 판단합니다.
  const pathname = usePathname();
  
  // 모바일 메뉴가 열려있는지 여부를 관리하는 상태
  // mobileOpen = true면 메뉴가 열려있고, false면 닫혀있습니다.
  const [mobileOpen, setMobileOpen] = useState(false);

  // 사용자 드롭다운 메뉴 열림/닫힘 상태
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // 현재 로그인한 사용자 정보
  const user = session?.user;
  const isLoggedIn = !!user;
  const isAdmin = user?.role === "ADMIN";

  // 역할에 따라 추가되는 네비게이션 링크
  // MEMBER/ADMIN: 수업일지 링크 추가
  // ADMIN: 관리자 링크 추가
  const roleLinks = [];
  if (isLoggedIn) {
    roleLinks.push({ href: "/class-logs", label: "수업일지" });
  }
  if (isAdmin) {
    roleLinks.push({ href: "/admin", label: "관리자" });
  }

  // 전체 네비게이션 링크 = 기본 링크 + 역할별 링크
  const allNavLinks = [...navLinks, ...roleLinks];

  /**
   * 로그아웃 처리 함수
   * next-auth의 signOut을 호출하여 세션을 종료합니다.
   */
  const handleSignOut = async () => {
    setUserMenuOpen(false);
    setMobileOpen(false);
    await signOut({ callbackUrl: "/" });
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/10">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
         {/* 로고: 클릭하면 홈페이지("/")로 이동 */}
         <Link href="/" className="text-xl font-bold tracking-tight text-white">
           HRA
         </Link>

         {/* 
           데스크톱 네비게이션: md(화면 너비 768px) 이상일 때만 표시
           모바일에서는 hidden으로 숨겨집니다.
         */}
         <div className="hidden items-center gap-6 md:flex">
           {/* navLinks + roleLinks를 순회하며 네비게이션 버튼을 만듭니다 */}
           {allNavLinks.map((link) => (
             <Link
               key={link.href}
               href={link.href}
               className={cn(
                 "text-sm font-medium tracking-wide transition-colors",
                 // 현재 페이지가 이 링크와 일치하면 흰색, 아니면 회색
                 // startsWith를 사용하면 /recruitment/apply도 /recruitment 링크를 활성화합니다
                 pathname === link.href || pathname.startsWith(link.href + "/")
                   ? "text-white"
                   : "text-gray-400 hover:text-white"
               )}
             >
              {link.label}
            </Link>
          ))}

          {/* 로그인/사용자 메뉴 영역 */}
          {isLoggedIn ? (
            // 로그인 상태: 사용자 이름 + 드롭다운 메뉴
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:text-white"
              >
                <span>{user?.name || "사용자"}</span>
                <ChevronDown className={cn("size-4 transition-transform", userMenuOpen && "rotate-180")} />
              </button>

              {/* 사용자 드롭다운 메뉴 */}
              {userMenuOpen && (
                <>
                  {/* 드롭다운 외부 클릭 시 닫기 */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setUserMenuOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-white/10 bg-black/95 py-1 shadow-lg">
                    <div className="px-3 py-2 border-b border-white/10">
                      <p className="text-sm text-white">{user?.name}</p>
                      <p className="text-xs text-gray-400">{user?.email}</p>
                    </div>
                    <Link
                      href="/mypage"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <User className="size-4" />
                      마이페이지
                    </Link>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <LogOut className="size-4" />
                      로그아웃
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            // 미로그인 상태: 로그인 버튼
            <Link
              href="/login"
              className="flex items-center gap-1.5 rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              <LogIn className="size-4" />
              로그인
            </Link>
          )}
        </div>

         <button
           type="button"
           className="text-white md:hidden p-2 -mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
           onClick={() => setMobileOpen(!mobileOpen)}
           aria-label="Toggle menu"
         >
           {/* 
             모바일에서만 표시되는 메뉴 아이콘
             mobileOpen이 true면 X 아이콘, false면 Menu 아이콘 표시
           */}
           {mobileOpen ? <X size={24} /> : <Menu size={24} />}
         </button>
      </nav>

       {/* 
         모바일 메뉴: mobileOpen이 true일 때만 표시됩니다.
         사용자가 모바일에서 Menu 아이콘을 클릭하면 이 메뉴가 아래로 펼쳐집니다.
       */}
       {mobileOpen && (
        <div className="border-t border-white/10 bg-black/95 md:hidden">
          <div className="flex flex-col gap-1 px-6 py-4">
            {allNavLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "rounded-md px-3 py-3 text-sm font-medium transition-colors",
                  pathname === link.href || pathname.startsWith(link.href + "/")
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:bg-white/5 hover:text-white"
                )}
              >
                {link.label}
              </Link>
            ))}

            {/* 모바일 메뉴 하단: 로그인/로그아웃 */}
            <div className="mt-2 border-t border-white/10 pt-3">
              {isLoggedIn ? (
                <div className="space-y-2">
                  {/* 사용자 정보 표시 */}
                  <div className="px-3 py-2">
                    <p className="text-sm text-white">{user?.name || "사용자"}</p>
                    <p className="text-xs text-gray-400">{user?.email}</p>
                  </div>
                  <Link
                    href="/mypage"
                    onClick={() => setMobileOpen(false)}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-3 text-sm font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <User className="size-4" />
                    마이페이지
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-3 text-sm font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <LogOut className="size-4" />
                    로그아웃
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-md bg-white/10 px-3 py-3 text-sm font-medium text-white transition-colors hover:bg-white/20"
                >
                  <LogIn className="size-4" />
                  로그인
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
