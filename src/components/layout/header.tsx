/**
 * 헤더 컴포넌트 - 사이트 상단의 네비게이션 바
 *
 * 이 컴포넌트는 HRA 웹사이트의 맨 위에 표시되는 헤더를 만듭니다.
 * - 로고(HRA) 표시
 * - PC 화면에서는 가로로 네비게이션 링크 표시
 * - 모바일 화면에서는 메뉴 아이콘으로 햄버거 메뉴 제공
 * - 현재 페이지를 표시해주는 액티브 상태 관리
 *
 * "use client" = 이 컴포넌트는 클라이언트 컴포넌트입니다.
 * 클라이언트 컴포넌트는 사용자의 브라우저에서 실행되고,
 * 클릭이나 상태 변화 같은 상호작용을 처리할 수 있습니다.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 네비게이션 링크 배열
 * 사이트의 주요 페이지들을 여기에 정의합니다.
 * 각 객체는 { href: "이동할 주소", label: "화면에 보여줄 텍스트" } 형태입니다.
 */
const navLinks = [
  { href: "/about", label: "소개" },
  { href: "/curriculum", label: "커리큘럼" },
  { href: "/cohorts", label: "기수 소개" },
  { href: "/recruitment", label: "모집안내" },
  { href: "/notices", label: "공지사항" },
  { href: "/gallery", label: "갤러리" },
];

/**
 * Header 컴포넌트 - 헤더를 렌더링하는 함수
 */
export function Header() {
  // 현재 페이지의 URL 경로를 가져옵니다. (예: "/recruitment")
  // 이를 통해 어느 네비게이션 링크가 활성화되었는지 판단합니다.
  const pathname = usePathname();
  
  // 모바일 메뉴가 열려있는지 여부를 관리하는 상태
  // mobileOpen = true면 메뉴가 열려있고, false면 닫혀있습니다.
  const [mobileOpen, setMobileOpen] = useState(false);

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
         <div className="hidden items-center gap-8 md:flex">
           {/* navLinks 배열의 각 링크를 순회하며 네비게이션 버튼을 만듭니다 */}
           {navLinks.map((link) => (
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
        </div>

         <button
           type="button"
           className="text-white md:hidden"
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
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  pathname === link.href || pathname.startsWith(link.href + "/")
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:bg-white/5 hover:text-white"
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
