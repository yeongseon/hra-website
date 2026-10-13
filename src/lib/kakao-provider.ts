/**
 * 카카오 이메일 동의 설정이 완료된 환경에서만 account_email 범위를 요청한다.
 * 동의 항목을 켜기 전에 범위를 요청하면 카카오가 invalid_scope로 로그인을 막는다.
 */
import Kakao from "next-auth/providers/kakao";

export function createKakaoProvider(
  clientId: string,
  clientSecret: string,
  requestEmail: boolean,
) {
  return Kakao({
    clientId,
    clientSecret,
    ...(requestEmail
      ? {
          authorization: {
            url: "https://kauth.kakao.com/oauth/authorize",
            params: {
              scope: "account_email,profile_nickname,profile_image",
            },
          },
        }
      : {}),
  });
}
