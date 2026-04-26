"use client";

import Link from "next/link";
import { Mail } from "lucide-react";

interface EnvelopeIconProps {
  isOpen: boolean;
}

export function EnvelopeIcon({ isOpen }: EnvelopeIconProps) {
  return (
    <div className="group z-10 flex flex-col items-center justify-center gap-2">
      <div className="relative cursor-pointer transition-transform duration-300 group-hover:scale-110">
        <Mail className="w-10 h-10 text-[#2563EB]" strokeWidth={1.5} />
      </div>

      <div className="overflow-hidden transition-all duration-300 max-h-0 opacity-0 group-hover:max-h-12 group-hover:opacity-100">
        {isOpen ? (
          <Link
            href="/recruitment/apply"
            className="inline-flex shrink-0 items-center rounded-full bg-[#2563EB] px-4 py-2 text-sm font-semibold whitespace-nowrap text-white shadow-sm transition-colors hover:bg-[#1f54c7]"
          >
            지원하기
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex shrink-0 cursor-not-allowed items-center rounded-full border border-[#D9D9D9] bg-[#EFF6FF] px-4 py-2 text-sm font-semibold whitespace-nowrap text-[#666666]"
          >
            모집 준비중
          </span>
        )}
      </div>
    </div>
  );
}
