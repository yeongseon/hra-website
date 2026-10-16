/**
 * 요청의 실제 Host와 Origin을 비교하는 공통 HTTP 경계입니다.
 * Next가 loopback URL을 localhost로 바꾸더라도 브라우저가 접속한 호스트·포트를 유지합니다.
 * Origin이 없는 요청의 허용 여부는 호출자가 결정하며, 이 함수 자체는 출처 일치만 확인합니다.
 */
export function isSameRequestOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  let expectedOrigin = requestUrl.origin;
  if (host !== null) {
    // Host는 authority 하나만 허용하고 경로·사용자정보·복수 호스트를 재해석하지 않습니다.
    if (!host || /[\s,/@\\?#]/.test(host)) return false;
    try {
      expectedOrigin = new URL(`${requestUrl.protocol}//${host}`).origin;
    } catch {
      return false;
    }
  }
  // 프록시가 전달한 임의의 x-forwarded-host 대신 실제 Host만 비교에 사용합니다.
  return origin === expectedOrigin;
}
