/**
 * 공지 미리보기 설명에서 편집기 HTML과 공백 엔터티가 노출되지 않는지 확인합니다 (#130).
 */
import { describe, expect, it } from "vitest";
import { buildNoticeExcerpt } from "@/lib/notice-excerpt";

describe("공지 미리보기 설명", () => {
  it("HTML 태그와 엔터티를 읽을 수 있는 평문으로 변환한다", () => {
    expect(buildNoticeExcerpt("<p>첫&nbsp;공지 &amp; 안내</p><br><strong>둘째</strong>"))
      .toBe("첫 공지 & 안내 둘째");
  });
});
