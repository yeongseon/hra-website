/**
 * HTML 요청마다 CSP nonce를 전달하고 기존 네 보호 경로에서만 인증을 수행한다.
 * 원본 요청과 이벤트를 Auth.js에 그대로 넘겨 Server Action 본문을 건드리지 않는다.
 */
import { NextResponse, type NextRequest, type NextFetchEvent, type NextMiddleware } from "next/server";
import { auth } from "@/lib/auth";
import { logServerError } from "@/lib/errors";
import { createContentSecurityPolicy } from "@/lib/security/csp";

/** 유사 접두어의 공개 경로에 인증 조회가 추가되지 않도록 경계를 확인한다. */
function requiresAuthentication(pathname: string) {
  return ["/admin", "/resources", "/member", "/mypage"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  // 외부 입력을 신뢰하지 않고 매 요청 256비트 난수와 대응하는 정책을 새로 만든다.
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
  const policy = createContentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  requestHeaders.delete("Content-Security-Policy-Report-Only");

  // 요청별 closure를 사용하므로 동시 요청의 nonce가 서로 섞이지 않는다.
  const next: NextMiddleware = () => NextResponse.next({ request: { headers: requestHeaders } });
  try {
    const response = requiresAuthentication(request.nextUrl.pathname)
      ? await auth(next)(request, event)
      : await next(request, event);
    if (!response) throw new Error("CSP_PROXY_RESPONSE_MISSING");
    // 기존 Auth.js 응답의 redirect·쿠키를 보존하고 CSP만 보강한다.
    response.headers.set("Content-Security-Policy", policy);
    return response;
  } catch (error) {
    logServerError("proxy/auth", error);
    const response = NextResponse.redirect(new URL("/system-error", request.url));
    response.headers.set("Content-Security-Policy", policy);
    return response;
  }
}

export const config = {
  // 실제 정적 자원만 제외한다. 점이 있는 미존재 HTML 경로도 CSP를 받아야 한다.
  // 새 공개 자원을 추가할 때 이 목록과 matcher 계약을 함께 확인한다.
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|(?:favicon\\.ico|globe\\.svg|vercel\\.svg|window\\.svg|next\\.svg|file\\.svg)$|images/(?:hero-bg|faculty-classics|faculty-casestudy|faculty-lecture|cohort-17)\\.jpeg$).*)"],
};
