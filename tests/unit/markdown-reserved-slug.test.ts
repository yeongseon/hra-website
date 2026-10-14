/**
 * 예약어 slug가 객체 프로토타입을 파일명으로 잘못 해석하지 않는지 검증합니다 (#124).
 */
import { describe, expect, it } from "vitest";
import { readGuide, readTemplateFromContent } from "@/lib/markdown/read-from-content";

describe("Markdown 예약어 slug", () => {
  it.each(["constructor", "__proto__", "toString"])("가이드 %s를 찾지 못한 값으로 취급한다", async (slug) => {
    await expect(readGuide(slug)).resolves.toBeNull();
  });

  it.each(["constructor", "__proto__", "toString"])("양식 %s를 찾지 못한 값으로 취급한다", async (slug) => {
    await expect(readTemplateFromContent(slug)).resolves.toBeNull();
  });
});
