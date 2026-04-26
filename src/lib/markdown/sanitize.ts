/**
 * Markdown 렌더링 보안 정책 (이슈 #19)
 *
 * 역할: rehype-sanitize를 위한 화이트리스트 기반 보안 스키마를 정의한다.
 *       관리자가 작성한 Markdown 또는 가이드 파일이 렌더링될 때
 *       script/iframe/inline event handler 등 위험 요소를 차단하여
 *       XSS 공격을 무력화한다.
 *
 * 정책 요약:
 *   허용: 제목/문단/목록/표(GFM), 인용문, 코드블록, 링크, 이미지(https + 화이트리스트 도메인)
 *   차단: script, iframe, object, embed, inline event handlers (onclick 등), style attribute
 *
 * 사용 위치:
 *   - src/components/markdown/markdown-viewer.tsx (rehypePlugins로 적용)
 *   - src/lib/markdown/__tests__/sanitize.test.ts (XSS 테스트)
 */

import { defaultSchema } from "rehype-sanitize";
import type { Options } from "rehype-sanitize";

// 이미지 src로 허용할 도메인 화이트리스트
// - blob.vercel-storage.com: Vercel Blob 업로드 이미지
// - hra-website-theta.vercel.app: 자체 도메인 절대 경로
const allowedImageHosts = [
  "blob.vercel-storage.com",
  "vercel-storage.com",
  "hra-website-theta.vercel.app",
];

// rehype-sanitize 스키마
// defaultSchema를 베이스로, 위험한 태그·속성을 추가로 차단한다.
export const sanitizeSchema: Options = {
  ...defaultSchema,
  // tagNames에서 raw HTML 위험 태그를 명시적으로 제거
  // (defaultSchema는 안전한 기본값이지만, GFM 표 등을 위해 명시적으로 보강)
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    // GFM 표 — remark-gfm 사용 시 필수
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    // 인용/코드 블록 보강
    "blockquote",
    "pre",
    "code",
  ].filter(
    // 명시적 차단 태그 제거 (이중 안전장치)
    (tag) =>
      !["script", "iframe", "object", "embed", "form", "input", "button"].includes(
        tag,
      ),
  ),
  attributes: {
    ...(defaultSchema.attributes ?? {}),
    // 모든 태그에 공통으로 차단되는 속성을 정의하기 위해 별도 처리하지 않고
    // defaultSchema가 이미 onclick 등 inline event handler를 차단함을 신뢰
    // 단, style attribute는 명시적으로 제외
    "*": (defaultSchema.attributes?.["*"] ?? []).filter(
      (attr) => attr !== "style",
    ),
    // 외부 링크 보안 — target/rel만 허용
    a: [
      ...(defaultSchema.attributes?.a ?? []),
      ["target", "_blank", "_self"],
      ["rel", "noopener", "noreferrer", "nofollow"],
    ],
    // 이미지 src/alt만 허용 — onload 등 차단
    img: [
      ["src"],
      ["alt"],
      ["title"],
      ["width"],
      ["height"],
      ["loading", "lazy", "eager"],
    ],
  },
  // protocols 화이트리스트 — javascript: 등 차단
  protocols: {
    href: ["http", "https", "mailto", "tel"],
    src: ["http", "https"],
  },
  // 이미지 src 도메인 검사는 sanitize 단계에서 직접 처리하기 어렵기 때문에
  // markdown-viewer 컴포넌트에서 url 검증 후 넘기는 추가 방어선을 둔다.
};

// 외부 이미지 URL이 허용 도메인인지 검사
// markdown-viewer에서 호출하여 차단 시 이미지 자체를 렌더링하지 않는다.
export function isAllowedImageUrl(url: string): boolean {
  if (!url) return false;
  // 동일 출처 상대 경로는 허용
  if (url.startsWith("/")) return true;
  try {
    const parsed = new URL(url);
    // https 프로토콜만 허용 (data: 차단 — Base64 폭주 방지)
    if (parsed.protocol !== "https:") return false;
    // 호스트 화이트리스트 검사 (subdomain 포함)
    return allowedImageHosts.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}
