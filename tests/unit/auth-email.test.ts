/**
 * 마이페이지에서 실제 이메일과 소셜 로그인 내부 주소를 구분하는 회귀 테스트다.
 */
import { describe, expect, it } from "vitest";
import { getDisplayEmail } from "@/lib/auth-email";

describe("getDisplayEmail", () => {
  it("카카오와 구글 로그인 내부 주소를 표시하지 않는다", () => {
    expect(getDisplayEmail("kakao_123@oauth.placeholder")).toBeNull();
    expect(getDisplayEmail("google_abc@OAUTH.PLACEHOLDER")).toBeNull();
  });

  it("제공받은 실제 이메일 주소는 그대로 표시한다", () => {
    expect(getDisplayEmail("member@example.com")).toBe("member@example.com");
    expect(getDisplayEmail("member@oauth.placeholder.com")).toBe(
      "member@oauth.placeholder.com",
    );
  });

  it("이메일 값이 없으면 미등록 상태로 처리한다", () => {
    expect(getDisplayEmail(null)).toBeNull();
    expect(getDisplayEmail(undefined)).toBeNull();
  });
});
