/**
 * 소셜 로그인에서 이메일을 제공하지 않을 때 생성한 내부 주소를 화면 표시에서 제외한다.
 * oauth.placeholder 도메인은 연락 가능한 실제 이메일 주소가 아니다.
 */
export function getDisplayEmail(email: string | null | undefined): string | null {
  if (!email || email.toLowerCase().endsWith("@oauth.placeholder")) {
    return null;
  }

  return email;
}
