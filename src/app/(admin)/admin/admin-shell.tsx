"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ClipboardList,
  FileText,
  GalleryHorizontal,
  LayoutDashboard,
  Menu,
  Users,
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

const navItems = [
  { href: "/admin", label: "대시보드", icon: LayoutDashboard },
  { href: "/admin/notices", label: "공지사항", icon: Bell },
  { href: "/admin/class-logs", label: "수업일지", icon: ClipboardList },
  { href: "/admin/recruitment", label: "기수 관리", icon: Users },
  { href: "/admin/gallery", label: "갤러리", icon: GalleryHorizontal },
  { href: "/admin/applications", label: "지원서", icon: FileText },
];

function AdminNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1.5">
      {navItems.map((item) => {
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
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col">
          <div className="px-6 py-5">
            <p className="text-sm font-semibold tracking-wide text-slate-900">HRA Admin</p>
          </div>
          <Separator className="bg-slate-200" />
          <div className="flex-1 p-4">
            <AdminNav />
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex h-16 items-center justify-between px-4 md:px-6">
              <div className="flex items-center gap-2 md:hidden">
                <Sheet>
                  <SheetTrigger
                    render={<Button variant="outline" size="icon" className="bg-white" />}
                    aria-label="메뉴 열기"
                  >
                    <Menu className="size-4" />
                  </SheetTrigger>
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

              <div className="hidden text-sm font-semibold tracking-wide md:block">HRA Admin</div>

              <div className="text-sm text-slate-600">
                관리자 <span className="font-semibold text-slate-900">{userName}</span>
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
