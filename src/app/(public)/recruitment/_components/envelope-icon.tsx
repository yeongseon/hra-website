"use client";

import { Mail } from "lucide-react";

interface EnvelopeIconProps {
  url: string | null;
}

export function EnvelopeIcon({ url }: EnvelopeIconProps) {
  return (
    <div className="group relative flex flex-col items-center justify-center z-10">
      <div className="relative cursor-pointer transition-transform duration-300 group-hover:scale-110">
        <Mail className="w-10 h-10 text-[#2563EB]" strokeWidth={1.5} />
      </div>
      
      <div 
        className="absolute top-full mt-2 transition-all duration-300 ease-in-out opacity-0 -translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto"
      >
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 whitespace-nowrap"
          >
            지원하기
          </a>
        ) : (
          <span className="inline-flex shrink-0 items-center rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-400 whitespace-nowrap cursor-not-allowed">
            지원하기
          </span>
        )}
      </div>
    </div>
  );
}
