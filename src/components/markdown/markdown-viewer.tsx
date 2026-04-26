/**
 * MarkdownViewer 클라이언트 컴포넌트 (이슈 #10, #19)
 *
 * 역할: react-markdown 기반 Markdown 렌더러. remark-gfm으로 GFM(표/체크박스/취소선)을
 *       지원하고 rehype-sanitize로 XSS를 방어한다. 디자인 토큰(#1a1a1a, #666666,
 *       border-[#D9D9D9])을 적용한 한국어 문서 스타일을 제공한다.
 *
 * 사용 위치:
 *   - 회원 가이드/템플릿 상세 페이지 (#9)
 *   - 관리자 템플릿 미리보기 (#12)
 *   - PDF 인쇄 페이지 (#11)
 */
"use client";

import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { isAllowedImageUrl, sanitizeSchema } from "@/lib/markdown/sanitize";
import { cn } from "@/lib/utils";

type MarkdownViewerProps = {
  body: string;
  className?: string;
};

export function MarkdownViewer({ body, className }: MarkdownViewerProps) {
  return (
    <article
      className={cn(
        "prose prose-slate max-w-none text-[#1a1a1a]",
        "prose-headings:text-[#1a1a1a] prose-headings:font-semibold",
        "prose-p:text-[#1a1a1a] prose-p:leading-relaxed",
        "prose-a:text-[#2563EB] prose-a:no-underline hover:prose-a:underline",
        "prose-strong:text-[#1a1a1a]",
        "prose-blockquote:border-l-4 prose-blockquote:border-[#D9D9D9] prose-blockquote:bg-gray-50 prose-blockquote:px-4 prose-blockquote:py-2 prose-blockquote:text-[#666666]",
        "prose-table:border prose-table:border-[#D9D9D9]",
        "prose-th:border prose-th:border-[#D9D9D9] prose-th:bg-gray-50 prose-th:px-3 prose-th:py-2",
        "prose-td:border prose-td:border-[#D9D9D9] prose-td:px-3 prose-td:py-2",
        "prose-img:rounded-lg prose-img:border prose-img:border-[#D9D9D9]",
        "prose-code:rounded prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-sm prose-code:text-[#1a1a1a] prose-code:before:content-[''] prose-code:after:content-['']",
        "prose-pre:bg-gray-900 prose-pre:text-gray-100",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        // rehype-raw로 표 셀 안의 <br> 등 화이트리스트된 raw HTML을 파싱한 뒤
        // rehype-sanitize로 위험 태그/속성을 차단한다 (순서 중요).
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={{
          // 외부 링크는 새 탭으로 열고 보안 속성을 강제
          a: ({ href, children, ...props }) => {
            const isExternal = href?.startsWith("http") ?? false;
            return (
              <a
                href={href}
                {...(isExternal
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                {...props}
              >
                {children}
              </a>
            );
          },
          // 화이트리스트 도메인이 아닌 이미지는 자리 표시자만 노출
          img: ({ src, alt, ...props }) => {
            const url = typeof src === "string" ? src : "";
            if (!isAllowedImageUrl(url)) {
              return (
                <span className="inline-block rounded border border-dashed border-[#D9D9D9] bg-gray-50 px-3 py-2 text-xs text-[#666666]">
                  허용되지 않은 이미지 출처입니다 ({alt || url})
                </span>
              );
            }
            // eslint-disable-next-line @next/next/no-img-element
            return <img src={url} alt={alt ?? ""} {...props} />;
          },
        }}
      >
        {body}
      </ReactMarkdown>
    </article>
  );
}
