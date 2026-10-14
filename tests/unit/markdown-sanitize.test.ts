/**
 * Markdown 보안 정책 단위 테스트 (이슈 #19)
 *
 * 검증 대상:
 *   - sanitizeSchema가 script/iframe/onclick 등 위험 요소를 차단
 *   - isAllowedImageUrl 도메인 화이트리스트
 */
import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { isAllowedImageUrl, sanitizeSchema } from "@/lib/markdown/sanitize";

async function renderMarkdown(input: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify)
    .process(input);
  return String(file);
}

describe("sanitizeSchema", () => {
  it("script 태그를 제거한다", async () => {
    const out = await renderMarkdown("<script>alert(1)</script>안녕");
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("alert(1)");
  });

  it("iframe 태그를 제거한다", async () => {
    const out = await renderMarkdown('<iframe src="https://evil.com"></iframe>');
    expect(out).not.toContain("<iframe");
  });

  it("inline onclick 핸들러를 제거한다", async () => {
    const out = await renderMarkdown('<a href="#" onclick="alert(1)">click</a>');
    expect(out).not.toContain("onclick");
  });

  it("style 속성을 제거한다", async () => {
    const out = await renderMarkdown('<p style="color:red">텍스트</p>');
    expect(out).not.toContain("style=");
  });

  it("javascript: URL을 차단한다", async () => {
    const out = await renderMarkdown('[클릭](javascript:alert(1))');
    expect(out).not.toContain("javascript:");
  });

  it('rel 없는 새 창 링크에서 target="_blank"를 제거한다', async () => {
    const out = await renderMarkdown('<a href="https://example.com" target="_blank">링크</a>');
    expect(out).toContain('href="https://example.com"');
    expect(out).not.toContain('target="_blank"');
  });

  it("정상 표/링크/이미지는 유지한다", async () => {
    const out = await renderMarkdown(
      "| A | B |\n|---|---|\n| 1 | 2 |\n\n[링크](https://example.com)",
    );
    expect(out).toContain("<table>");
    expect(out).toContain('href="https://example.com"');
  });

  it("표 셀 안의 <br> 태그를 유지한다 (조원 명단 등)", async () => {
    const out = await renderMarkdown(
      "| 항목 | 값 |\n|---|---|\n| 조원 | 김철수<br>이영희<br>박민수 |",
    );
    expect(out).toContain("<br>");
    expect(out).toContain("김철수");
    expect(out).toContain("이영희");
  });
});

describe("isAllowedImageUrl", () => {
  it("프로젝트 Blob 저장소의 이미지는 허용한다", () => {
    expect(
      isAllowedImageUrl("https://4sompt13gxwuz2x8.public.blob.vercel-storage.com/x.png"),
    ).toBe(true);
  });

  it("다른 Blob 저장소와 허용 호스트의 하위 도메인은 거부한다", () => {
    expect(isAllowedImageUrl("https://other.public.blob.vercel-storage.com/x.png")).toBe(false);
    expect(isAllowedImageUrl("https://sub.hra-website-theta.vercel.app/x.png")).toBe(false);
  });

  it("동일 출처 상대 경로는 허용한다", () => {
    expect(isAllowedImageUrl("/images/foo.png")).toBe(true);
  });

  it("외부 호스트로 해석되는 상대 경로는 거부한다", () => {
    expect(isAllowedImageUrl("//evil.com/image.png")).toBe(false);
    expect(isAllowedImageUrl("/\\evil.com/image.png")).toBe(false);
  });

  it("외부 임의 도메인은 거부한다", () => {
    expect(isAllowedImageUrl("https://evil.com/foo.png")).toBe(false);
  });

  it("data: 스킴은 거부한다", () => {
    expect(isAllowedImageUrl("data:image/png;base64,iVBOR")).toBe(false);
  });

  it("http(비암호화)는 거부한다", () => {
    expect(
      isAllowedImageUrl("http://blob.vercel-storage.com/x.png"),
    ).toBe(false);
  });
});
