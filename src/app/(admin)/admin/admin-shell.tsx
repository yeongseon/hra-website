/**
 * 관리자 사이드바 쉘 (AdminShell)
 * 
 * 클라이언트 컴포넌트 - 관리자 페이지의 UI 레이아웃을 담당합니다.
 * - 좌측 사이드바: 네비게이션 메뉴 (대시보드, 공지사항, 자료실 등)
 * - 상단 헤더: 페이지 제목, 관리자 이름 표시
 * - 모바일: 작은 화면에서 사이드바를 메뉴 아이콘으로 전환
 * 
 * "use client" 필수 — 클라이언트 컴포넌트란?
 * Next.js 기본은 서버 컴포넌트(SSR)인데, 사용자 인터랙션이 필요하면
 * 파일 맨 위에 "use client"를 적으면 클라이언트에서 렌더링됩니다.
 * 여기서는 usePathname() 훅으로 현재 URL을 감지해 활성 메뉴를 표시하려면
 * 클라이언트 컴포넌트여야 합니다.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpen,
  FileText,
  FolderOpen,
  GalleryHorizontal,
  GraduationCap,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Phone,
  Settings,
  Users,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type AdminShellProps = {
  userName: string;
  children: React.ReactNode;
};

// 관리자 네비게이션 메뉴 항목들
// href — 이동할 페이지 주소
// label — 메뉴에 표시할 텍스트
// icon — 메뉴 옆에 표시할 아이콘 컴포넌트
const navItems = [
  { href: "/admin", label: "대시보드", icon: LayoutDashboard },
  { href: "/admin/notices", label: "공지사항", icon: Bell },
  { href: "/admin/resources", label: "자료실", icon: FolderOpen },
  { href: "/admin/recruitment", label: "기수 관리", icon: Users },
  { href: "/admin/gallery", label: "갤러리", icon: GalleryHorizontal },
  { href: "/admin/applications", label: "지원서", icon: FileText },
  { href: "/admin/users", label: "회원 관리", icon: UserCog },
  { href: "/admin/docs", label: "개발 문서", icon: BookOpen },
  { href: "/admin/faculty", label: "교수진", icon: GraduationCap },
  { href: "/admin/alumni", label: "수료생 이야기", icon: MessageSquare },
  { href: "/admin/faq-contact", label: "FAQ 연락처", icon: Phone },
  { href: "/admin/recruitment-settings", label: "모집 설정", icon: Settings },
];

/**
 * AdminNav — 네비게이션 메뉴 컴포넌트
 * 사이드바 또는 모바일 메뉴에 표시될 네비게이션 항목들을 렌더링합니다.
 */
function AdminNav({ mobile = false }: { mobile?: boolean }) {
  // usePathname() — 클라이언트에서만 사용 가능한 훅
  // 현재 URL 경로를 문자열로 반환 (예: "/admin/notices")
  const pathname = usePathname();

  return (
    <nav className="space-y-1.5">
      {navItems.map((item) => {
        // 현재 페이지가 이 메뉴 항목인지 확인
        // "/admin"은 정확히 일치할 때만, 다른 항목은 접두사로 시작할 때 활성
        const isActive =
          item.href === "/admin"
            ? pathname === item.href
            : pathname.startsWith(item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              // 활성 상태: 검정 배경 + 흰 텍스트
              // 비활성: 회색 텍스트, 호버 시 회색 배경
              isActive
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              mobile && "py-2.5"
            )}
          >
            <Icon className="size-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({ userName, children }: AdminShellProps) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-screen-2xl">
        {/* 좌측 사이드바 — 태블릿/데스크톱에서만 표시 (md: breakpoint) */}
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col">
          <div className="px-6 py-5">
            <p className="text-sm font-semibold tracking-wide text-slate-900">HRA Admin</p>
          </div>
          <Separator className="bg-slate-200" />
          <div className="flex-1 p-4">
            <AdminNav />
          </div>
        </aside>

        {/* 메인 콘텐츠 영역 */}
        <div className="flex min-h-screen flex-1 flex-col">
          {/* 상단 헤더 */}
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex h-16 items-center justify-between px-4 md:px-6">
              {/* 모바일: 메뉴 열기 버튼 (md 이상에서 숨김) */}
              <div className="flex items-center gap-2 md:hidden">
                <Sheet>
                  {/* SheetTrigger — 클릭하면 사이드 메뉴 오픈 */}
                  <SheetTrigger
                    render={<Button variant="outline" size="icon" className="bg-white" />}
                    aria-label="메뉴 열기"
                  >
                    <Menu className="size-4" />
                  </SheetTrigger>
                  {/* SheetContent — 슬라이드 오픈되는 메뉴 패널 */}
                  <SheetContent side="left" className="w-72 bg-white p-0" showCloseButton>
                    <SheetHeader className="px-5 py-4">
                      <SheetTitle>HRA Admin</SheetTitle>
                    </SheetHeader>
                    <Separator className="bg-slate-200" />
                    <div className="p-4">
                      <AdminNav mobile />
                    </div>
                  </SheetContent>
                </Sheet>
                <p className="text-sm font-semibold tracking-wide">HRA Admin</p>
              </div>

              {/* 데스크톱에서 표시되는 제목 */}
              <div className="hidden text-sm font-semibold tracking-wide md:block">HRA Admin</div>

              {/* 관리자 이름 표시 */}
              <div className="text-sm text-slate-600">
                관리자 <span className="font-semibold text-slate-900">{userName}</span>
              </div>
            </div>
          </header>

          {/* 페이지 콘텐츠가 들어올 영역 (children) */}
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
