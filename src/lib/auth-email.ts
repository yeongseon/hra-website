/**
 * 소셜 로그인 이메일을 화면에 표시하거나 기존 내부 주소에서 승격할 때 사용한다.
 * oauth.placeholder 도메인은 연락 가능한 실제 이메일 주소가 아니다.
 */
export function isOAuthPlaceholderEmail(email: string): boolean {
  return email.toLowerCase().endsWith("@oauth.placeholder");
}

export function getDisplayEmail(email: string | null | undefined): string | null {
  if (!email || isOAuthPlaceholderEmail(email)) {
    return null;
  }

  return email;
}

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
