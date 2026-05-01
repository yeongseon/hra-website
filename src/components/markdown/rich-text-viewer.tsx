"use client";

import DOMPurify from "isomorphic-dompurify";
import { cn } from "@/lib/utils";

/**
 * 리치 텍스트 (HTML) 뷰어 컴포넌트
 * XSS 공격 방지를 위해 DOMPurify로 HTML을 살균한 뒤 렌더링합니다.
 */
interface RichTextViewerProps {
  body: string;
  className?: string;
}

export function RichTextViewer({ body, className }: RichTextViewerProps) {
  // DOMPurify 설정: TipTap에서 사용하는 span[style] 등 허용
  const sanitizedHtml = DOMPurify.sanitize(body, {
    ALLOWED_TAGS: [
      "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "p", "a",
      "ul", "ol", "nl", "li", "b", "i", "strong", "em", "strike",
      "code", "hr", "br", "div", "table", "thead", "caption",
      "tbody", "tr", "th", "td", "pre", "iframe", "img", "span", "u", "s"
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "class", "style", "target", "rel", "title"],
    FORCE_BODY: true,
  });

  return (
    <div
      className={cn("prose max-w-none break-words text-[#1a1a1a]", className)}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
