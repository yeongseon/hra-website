"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Search, X } from "lucide-react";

interface NoticeSearchProps {
  defaultValue?: string;
}

export function NoticeSearch({ defaultValue = "" }: NoticeSearchProps) {
  const [value, setValue] = useState(defaultValue);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `/notices?q=${encodeURIComponent(q)}` : "/notices");
  };

  const handleClear = () => {
    setValue("");
    inputRef.current?.focus();
    router.push("/notices");
  };

  return (
    <form onSubmit={handleSubmit} className="relative w-full sm:w-72">
      <input
        ref={inputRef}
        type="text"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="공지사항 검색..."
        className="w-full rounded-full border border-[#D9D9D9] bg-white px-4 py-2.5 text-sm outline-none transition-colors hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-[#1a1a1a] placeholder:text-[#666666]"
        style={{ paddingRight: value ? "5rem" : "2.75rem" }}
      />

      {/* X 버튼 — 입력값이 있을 때만 표시 */}
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-9 top-1/2 -translate-y-1/2 p-1 text-[#9CA3AF] hover:text-[#1a1a1a] transition-colors"
          aria-label="검색어 지우기"
        >
          <X className="size-3.5" />
        </button>
      )}

      {/* 돋보기 버튼 */}
      <button
        type="submit"
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#666666] hover:text-[#1a1a1a] transition-colors"
        aria-label="검색"
      >
        <Search className="size-4" />
      </button>
    </form>
  );
}
