/**
 * 카카오 콘솔 설정 전에는 이메일 범위를 요청하지 않는 구성을 확인한다.
 */
import { describe, expect, it } from "vitest";
import { createKakaoProvider } from "@/lib/kakao-provider";

describe("createKakaoProvider", () => {
  it("동의 항목을 활성화하기 전에는 기존 인증 범위를 유지한다", () => {
    const provider = createKakaoProvider("client-id", "client-secret", false);

    expect(provider.authorization).toBe("https://kauth.kakao.com/oauth/authorize?scope");
    expect(provider.options?.authorization).toBeUndefined();
  });

  it("활성화된 환경에서만 이메일과 프로필 범위를 요청한다", () => {
    const provider = createKakaoProvider("client-id", "client-secret", true);

    expect(provider.options?.authorization).toEqual({
      url: "https://kauth.kakao.com/oauth/authorize",
      params: { scope: "account_email,profile_nickname,profile_image" },
    });
  });
});
