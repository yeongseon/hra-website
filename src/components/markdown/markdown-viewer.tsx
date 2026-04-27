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
        // 인용구 (왼쪽 테두리, 배경, 패딩 개선)
        "prose-blockquote:rounded-r-lg prose-blockquote:border-l-4 prose-blockquote:border-[#D9D9D9] prose-blockquote:bg-gray-50/50 prose-blockquote:px-5 prose-blockquote:py-3 prose-blockquote:font-normal prose-blockquote:not-italic prose-blockquote:text-[#666666]",
        // 리스트 (간격, 들여쓰기 보강)
        "prose-ul:list-disc prose-ul:pl-6 prose-ul:marker:text-[#666666]",
        "prose-ol:list-decimal prose-ol:pl-6 prose-ol:marker:text-[#666666]",
        "prose-li:my-1.5",
        // 표 (가로 스크롤은 컴포넌트 래퍼에서 처리, 디자인 토큰 적용)
        "prose-table:w-full prose-table:border-collapse",
        "prose-th:border prose-th:border-[#D9D9D9] prose-th:bg-gray-50 prose-th:px-4 prose-th:py-2.5 prose-th:text-left prose-th:font-semibold prose-th:text-[#1a1a1a]",
        "prose-td:border prose-td:border-[#D9D9D9] prose-td:px-4 prose-td:py-2.5 prose-td:text-[#1a1a1a]",
        // 이미지
        "prose-img:my-6 prose-img:rounded-xl prose-img:border prose-img:border-[#D9D9D9] prose-img:shadow-sm",
        // 인라인 코드 & 코드 블록 (배경, 둥근 모서리, 줄바꿈)
        "prose-code:rounded-md prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-code:font-medium prose-code:text-[#2563EB]",
        "prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:bg-gray-900 prose-pre:p-4 prose-pre:text-gray-100 prose-pre:shadow-sm",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        // rehype-raw로 표 셀 안의 <br> 등 화이트리스트된 raw HTML을 파싱한 뒤
        // rehype-sanitize로 위험 태그/속성을 차단한다 (순서 중요).
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={{
          // 표(table)가 모바일에서 가로 스크롤되도록 래퍼 추가
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto my-6">
              <table {...props}>{children}</table>
            </div>
          ),
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
