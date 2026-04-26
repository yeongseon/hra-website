"use client";

import { Mail } from "lucide-react";

interface EnvelopeIconProps {
  url: string | null;
}

export function EnvelopeIcon({ url }: EnvelopeIconProps) {
  return (
    <div className="z-10 flex flex-col items-center justify-center gap-2">
      <div className="relative">
        <Mail className="w-10 h-10 text-[#2563EB]" strokeWidth={1.5} />
      </div>

      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center rounded-full bg-[#2563EB] px-4 py-2 text-sm font-semibold whitespace-nowrap text-white shadow-sm transition-colors hover:bg-[#1f54c7]"
        >
          지원하기
        </a>
      ) : (
        <span
          aria-disabled="true"
          className="inline-flex shrink-0 cursor-not-allowed items-center rounded-full border border-[#D9D9D9] bg-[#EFF6FF] px-4 py-2 text-sm font-semibold whitespace-nowrap text-[#666666]"
        >
          지원하기
        </span>
      )}
    </div>
  );
}
