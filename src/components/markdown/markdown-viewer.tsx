"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { cn } from "@/lib/utils";
import { isAllowedImageUrl, sanitizeSchema } from "@/lib/markdown/sanitize";

/**
 * 마크다운 본문 뷰어
 *
 * - 입력: DB에 저장된 마크다운 문자열.
 * - 렌더링: react-markdown + remark-gfm(표/체크박스/취소선) + rehype-sanitize.
 * - 보안: src/lib/markdown/sanitize.ts 의 화이트리스트 정책(sanitizeSchema)을 사용하고,
 *         이미지는 추가로 isAllowedImageUrl 호스트 검사를 통과해야만 렌더링한다.
 * - 스타일: Tailwind Typography(`prose`)에 사이트 디자인 토큰을 덧씌운다.
 */
interface MarkdownViewerProps {
  body: string;
  className?: string;
}

export function MarkdownViewer({ body, className }: MarkdownViewerProps) {
  return (
    <article
      className={cn(
        "prose max-w-none break-words text-[#1a1a1a]",
        "prose-headings:text-[#1a1a1a] prose-headings:font-semibold prose-headings:tracking-tight",
        "prose-h1:text-3xl prose-h1:mb-6",
        "prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4 prose-h2:border-b prose-h2:border-[#D9D9D9] prose-h2:pb-2",
        "prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3",
        "prose-h4:text-lg prose-h4:mt-6 prose-h4:mb-2",
        "prose-p:text-[#1a1a1a] prose-p:leading-relaxed",
        "prose-a:font-medium prose-a:text-[#2563EB] prose-a:no-underline hover:prose-a:underline",
        "prose-strong:text-[#1a1a1a] prose-strong:font-bold",
        "prose-blockquote:rounded-r-lg prose-blockquote:border-l-4 prose-blockquote:border-[#D9D9D9] prose-blockquote:bg-gray-50/50 prose-blockquote:px-5 prose-blockquote:py-3 prose-blockquote:font-normal prose-blockquote:not-italic prose-blockquote:text-[#666666]",
        "prose-ul:list-disc prose-ul:pl-6 prose-ul:marker:text-[#666666]",
        "prose-ol:list-decimal prose-ol:pl-6 prose-ol:marker:text-[#666666]",
        "prose-li:my-1.5",
        "prose-table:w-full prose-table:border-collapse",
        "prose-th:border prose-th:border-[#D9D9D9] prose-th:bg-gray-50 prose-th:px-4 prose-th:py-2.5 prose-th:text-left prose-th:font-semibold prose-th:text-[#1a1a1a]",
        "prose-td:border prose-td:border-[#D9D9D9] prose-td:px-4 prose-td:py-2.5 prose-td:text-[#1a1a1a]",
        "prose-img:my-6 prose-img:rounded-xl prose-img:border prose-img:border-[#D9D9D9] prose-img:shadow-sm",
        "prose-code:rounded-md prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-code:font-medium prose-code:text-[#2563EB]",
        "prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:bg-gray-900 prose-pre:p-4 prose-pre:text-gray-100 prose-pre:shadow-sm",
        "prose-hr:border-[#D9D9D9]",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={{
          img: ({ src, alt, ...rest }) => {
            const url = typeof src === "string" ? src : "";
            if (!isAllowedImageUrl(url)) return null;
            // eslint-disable-next-line @next/next/no-img-element
            return <img src={url} alt={alt ?? ""} {...rest} />;
          },
        }}
      >
        {body ?? ""}
      </ReactMarkdown>
    </article>
  );
}
