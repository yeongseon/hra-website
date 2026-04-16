"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, LogIn, LogOut, ChevronDown, User } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

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

type NavItem = {
  label: string;
  href?: string;
  subItems?: { label: string; href: string }[];
};

const navItems: NavItem[] = [
  {
    label: "소개",
    subItems: [
      { label: "HRA", href: "/about" },
      { label: "커리큘럼", href: "/curriculum" },
      { label: "교수진", href: "/faculty" },
      { label: "기수", href: "/cohorts" },
    ],
  },
  { label: "모집안내", href: "/recruitment" },
  {
    label: "소식",
    subItems: [
      { label: "공지사항", href: "/notices" },
      { label: "언론보도", href: "/press" },
      { label: "갤러리", href: "/gallery" },
    ],
  },
  {
    label: "커뮤니티",
    subItems: [
      { label: "수료생 이야기", href: "/alumni" },
      { label: "FAQ", href: "/faq" },
    ],
  },
  { label: "자료실", href: "/resources" },
];

export function Header({ session }: HeaderProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [openMobileDropdown, setOpenMobileDropdown] = useState<string | null>(null);

  const user = session?.user;
  const isLoggedIn = !!user;
  const isAdmin = user?.role === "ADMIN";

  const handleSignOut = async () => {
    setUserMenuOpen(false);
    setMobileOpen(false);
    await signOut({ callbackUrl: "/" });
  };

  const isItemActive = (href?: string, subItems?: { href: string }[]) => {
    if (href && (pathname === href || pathname.startsWith(href + "/"))) return true;
    if (subItems?.some(sub => pathname === sub.href || pathname.startsWith(sub.href + "/"))) return true;
    return false;
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-[#D9D9D9]">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
         <Link href="/" className="text-xl font-bold tracking-tight text-gray-900">
           HRA
         </Link>

         <div className="hidden items-center gap-6 md:flex">
           {navItems.map((item) => {
             const active = isItemActive(item.href, item.subItems);
             
             if (item.subItems) {
               return (
                 <div key={item.label} className="group relative py-6">
                   <button
                     type="button"
                     className={cn(
                       "flex items-center gap-1 text-sm font-medium tracking-wide transition-colors",
                        active ? "text-[#2563EB]" : "text-gray-600 group-hover:text-gray-900"
                     )}
                   >
                     {item.label}
                     <ChevronDown className="size-4 transition-transform group-hover:rotate-180" />
                   </button>
                    <div className="invisible absolute top-full left-0 mt-0 w-48 opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100 group-hover:translate-y-1">
                       <div className="rounded-md border border-[#D9D9D9] bg-white py-1 shadow-[var(--shadow-soft)]">
                       {item.subItems.map((sub) => {
                         const subActive = pathname === sub.href || pathname.startsWith(sub.href + "/");
                         return (
                           <Link
                             key={sub.href}
                             href={sub.href}
                             className={cn(
                               "block px-4 py-2 text-sm transition-colors",
                                subActive ? "bg-blue-50 text-[#2563EB] font-semibold" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                             )}
                           >
                             {sub.label}
                           </Link>
                         );
                       })}
                     </div>
                   </div>
                 </div>
               );
             }

             return (
               <Link
                 key={item.label}
                 href={item.href!}
                 className={cn(
                   "text-sm font-medium tracking-wide transition-colors",
                    active ? "text-[#2563EB]" : "text-gray-600 hover:text-gray-900"
                 )}
               >
                 {item.label}
               </Link>
             );
           })}

           {isAdmin && (
             <Link
               href="/admin"
               className={cn(
                 "text-sm font-medium tracking-wide transition-colors",
                  pathname.startsWith("/admin") ? "text-[#2563EB]" : "text-gray-600 hover:text-gray-900"
               )}
             >
               관리자
             </Link>
           )}

            <div className="flex items-center gap-4 ml-2 border-l border-[#D9D9D9] pl-6">
             {isLoggedIn ? (
               <div className="relative">
                 <button
                   type="button"
                   onClick={() => setUserMenuOpen(!userMenuOpen)}
                   className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 hover:bg-gray-50"
                 >
                   <span>{user?.name || "사용자"}</span>
                   <ChevronDown className={cn("size-4 transition-transform", userMenuOpen && "rotate-180")} />
                 </button>

                 {userMenuOpen && (
                   <>
                     <div
                       className="fixed inset-0 z-40"
                       onClick={() => setUserMenuOpen(false)}
                       aria-hidden="true"
                     />
                       <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-[#D9D9D9] bg-white py-1 shadow-[var(--shadow-soft)]">
                        <div className="px-3 py-2 border-b border-[#D9D9D9]">
                         <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                          <p className="text-sm text-gray-500">{user?.email}</p>
                       </div>
                       <Link
                         href="/mypage"
                         onClick={() => setUserMenuOpen(false)}
                         className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                       >
                         <User className="size-4" />
                         마이페이지
                       </Link>
                       <button
                         type="button"
                         onClick={handleSignOut}
                         className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                       >
                         <LogOut className="size-4" />
                         로그아웃
                       </button>
                     </div>
                   </>
                 )}
               </div>
             ) : (
               <div className="flex items-center gap-4">
                 <Link
                   href="/login"
                   className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
                 >
                   로그인
                 </Link>
                 <Link
                   href="/mypage"
                   className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
                 >
                   마이페이지
                 </Link>
               </div>
             )}
             
             <Link
               href="https://docs.google.com/forms/d/e/1FAIpQLSdWsLi_3umEuLWQXgOuSq5LTETmcolXy1I3auTohWY1ZTxiww/viewform"
               target="_blank"
               rel="noopener noreferrer"
               className="ml-2 inline-flex items-center justify-center rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
             >
               지원하기
             </Link>
           </div>
         </div>

         <div className="flex items-center gap-3 md:hidden">
           <Link
             href="https://docs.google.com/forms/d/e/1FAIpQLSdWsLi_3umEuLWQXgOuSq5LTETmcolXy1I3auTohWY1ZTxiww/viewform"
             target="_blank"
             rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg bg-[#2563EB] px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
           >
             지원하기
           </Link>
           <button
             type="button"
             className="text-gray-900 p-2 -mr-2 flex items-center justify-center"
             onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="메뉴 열기/닫기"
           >
             {mobileOpen ? <X size={24} /> : <Menu size={24} />}
           </button>
         </div>
      </nav>

       {mobileOpen && (
         <div className="border-t border-[#D9D9D9] bg-white md:hidden overflow-y-auto max-h-[calc(100vh-64px)] shadow-[var(--shadow-soft)] absolute w-full">
          <div className="flex flex-col px-4 py-4">
            {navItems.map((item) => {
              if (item.subItems) {
                const isOpen = openMobileDropdown === item.label;
                return (
                   <div key={item.label} className="border-b border-[#D9D9D9] last:border-none">
                    <button
                      type="button"
                      onClick={() => setOpenMobileDropdown(isOpen ? null : item.label)}
                      className="flex w-full items-center justify-between py-4 text-left text-sm font-medium text-gray-900"
                    >
                      {item.label}
                      <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} />
                    </button>
                    {isOpen && (
                      <div className="flex flex-col pb-4 pl-4 space-y-4">
                        {item.subItems.map((sub) => (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            onClick={() => setMobileOpen(false)}
                            className={cn(
                              "text-sm transition-colors",
                              pathname === sub.href || pathname.startsWith(sub.href + "/")
                                ? "text-[#2563EB] font-bold"
                                : "text-gray-600"
                            )}
                          >
                            {sub.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.label}
                  href={item.href!}
                  onClick={() => setMobileOpen(false)}
                   className="block border-b border-[#D9D9D9] py-4 text-sm font-medium text-gray-900 last:border-none"
                >
                  {item.label}
                </Link>
              );
            })}

            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMobileOpen(false)}
                className="block border-b border-[#D9D9D9] py-4 text-sm font-medium text-gray-900 last:border-none"
              >
                관리자
              </Link>
            )}

            <div className="mt-2 pt-4">
              {isLoggedIn ? (
                <div className="space-y-4 rounded-lg bg-gray-50 p-4 border border-[#D9D9D9]">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{user?.name || "사용자"}</p>
                    <p className="text-sm text-gray-500 mt-1">{user?.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href="/mypage"
                      onClick={() => setMobileOpen(false)}
                      className="flex flex-1 items-center justify-center gap-2 rounded-md bg-white border border-[#D9D9D9] py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      <User className="size-4" />
                      마이페이지
                    </Link>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex flex-1 items-center justify-center gap-2 rounded-md bg-white border border-[#D9D9D9] py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      <LogOut className="size-4" />
                      로그아웃
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-md bg-white border border-[#D9D9D9] py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    <LogIn className="size-4" />
                    로그인
                  </Link>
                  <Link
                    href="/mypage"
                    onClick={() => setMobileOpen(false)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-md bg-white border border-[#D9D9D9] py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    <User className="size-4" />
                    마이페이지
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
