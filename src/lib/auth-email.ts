/**
 * 소셜 로그인 원본 응답의 이메일 검증을 소유합니다.
 * 공용 표시 정책은 순수 계약 패키지에서 가져와 기존 Web import 경로로 재수출합니다.
 */
import { getDisplayEmail } from "@hra/contracts/identity";

export { getDisplayEmail, isOAuthPlaceholderEmail } from "@hra/contracts/identity";

/**
 * 카카오의 원본 계정 정보에서 유효하고 검증된 주소만 추출한다.
 * OAuth 사용자 객체의 이메일과 원본 응답이 일치해야 기존 계정 주소를 갱신한다.
 */
export function getVerifiedKakaoEmail(
  profile: unknown,
  oauthEmail: string | null | undefined,
): string | null {
  if (
    typeof oauthEmail !== "string" ||
    oauthEmail.length > 255 ||
    oauthEmail.trim() !== oauthEmail ||
    !oauthEmail.includes("@") ||
    getDisplayEmail(oauthEmail) === null ||
    !profile ||
    typeof profile !== "object" ||
    !("kakao_account" in profile)
  ) {
    return null;
  }

  const account = profile.kakao_account;
  if (!account || typeof account !== "object") {
    return null;
  }

  if (
    "email" in account &&
    account.email === oauthEmail &&
    "is_email_valid" in account &&
    account.is_email_valid === true &&
    "is_email_verified" in account &&
    account.is_email_verified === true
  ) {
    return oauthEmail;
  }

  return null;
}
