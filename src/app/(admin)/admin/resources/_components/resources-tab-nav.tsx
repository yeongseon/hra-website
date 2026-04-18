"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  {
    href: "/admin/resources",
    label: "수업일지",
    isActive: (pathname: string) =>
      pathname === "/admin/resources" ||
      pathname === "/admin/resources/new" ||
      /^\/admin\/resources\/[^/]+\/edit$/.test(pathname),
  },
  {
    href: "/admin/resources/weekly-texts",
    label: "주차별 텍스트",
    isActive: (pathname: string) =>
      pathname === "/admin/resources/weekly-texts" ||
      pathname.startsWith("/admin/resources/weekly-texts/"),
  },
  {
    href: "/admin/resources/guidebooks",
    label: "가이드북",
    isActive: (pathname: string) =>
      pathname === "/admin/resources/guidebooks" ||
      pathname.startsWith("/admin/resources/guidebooks/"),
  },
];

export function ResourcesTabNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex flex-wrap gap-2" aria-label="자료실 관리 탭">
      {tabs.map((tab) => {
        const isActive = tab.isActive(pathname);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
