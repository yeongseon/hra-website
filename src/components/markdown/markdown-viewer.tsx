"use client";

import { RichTextViewer } from "./rich-text-viewer";
import { cn } from "@/lib/utils";

/**
 * 하위 호환성을 위한 마크다운 뷰어 래퍼 컴포넌트
 * 기존 마크다운 뷰어를 사용하는 곳에서 코드 수정 없이 HTML 렌더러를 사용할 수 있도록 합니다.
 */
interface MarkdownViewerProps {
  body: string;
  className?: string;
}

export function MarkdownViewer({ body, className }: MarkdownViewerProps) {
  return (
    <article
      className={cn(
        "prose max-w-none text-[#1a1a1a]",
        // 텍스트 & 헤딩
        "prose-headings:text-[#1a1a1a] prose-headings:font-semibold prose-headings:tracking-tight",
        "prose-h1:text-3xl prose-h1:mb-6",
        "prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4 prose-h2:border-b prose-h2:border-[#D9D9D9] prose-h2:pb-2",
        "prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3",
        "prose-h4:text-lg prose-h4:mt-6 prose-h4:mb-2",
        "prose-p:text-[#1a1a1a] prose-p:leading-relaxed",
        // 링크 & 강조
        "prose-a:font-medium prose-a:text-[#2563EB] prose-a:no-underline hover:prose-a:underline",
        "prose-strong:text-[#1a1a1a] prose-strong:font-bold",
        // 인용구
        "prose-blockquote:rounded-r-lg prose-blockquote:border-l-4 prose-blockquote:border-[#D9D9D9] prose-blockquote:bg-gray-50/50 prose-blockquote:px-5 prose-blockquote:py-3 prose-blockquote:font-normal prose-blockquote:not-italic prose-blockquote:text-[#666666]",
        // 리스트
        "prose-ul:list-disc prose-ul:pl-6 prose-ul:marker:text-[#666666]",
        "prose-ol:list-decimal prose-ol:pl-6 prose-ol:marker:text-[#666666]",
        "prose-li:my-1.5",
        // 표
        "prose-table:w-full prose-table:border-collapse",
        "prose-th:border prose-th:border-[#D9D9D9] prose-th:bg-gray-50 prose-th:px-4 prose-th:py-2.5 prose-th:text-left prose-th:font-semibold prose-th:text-[#1a1a1a]",
        "prose-td:border prose-td:border-[#D9D9D9] prose-td:px-4 prose-td:py-2.5 prose-td:text-[#1a1a1a]",
        // 이미지
        "prose-img:my-6 prose-img:rounded-xl prose-img:border prose-img:border-[#D9D9D9] prose-img:shadow-sm",
        // 인라인 코드 & 코드 블록
        "prose-code:rounded-md prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-code:font-medium prose-code:text-[#2563EB]",
        "prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:bg-gray-900 prose-pre:p-4 prose-pre:text-gray-100 prose-pre:shadow-sm",
        className
      )}
    >
      <RichTextViewer body={body} className="!prose-none" />
    </article>
  );
}
