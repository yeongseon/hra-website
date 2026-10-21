/**
 * 실제 Auth.js 공개 API로 OAuth 경계를 검증하는 격리 공급자 도구다.
 * Google/Kakao의 기본 프로바이더 설정을 재사용하고 외부 HTTP만 customFetch로 대체한다.
 * 합성 코드 교환은 PKCE를 검증하며 Google에는 Node 암호화 API로 서명한 ID 토큰을 반환한다.
 * 공급자 서명 검증의 별도 구현이나 운영 자격정보·DB·네트워크 연결은 사용하지 않는다.
 * 범위는 Auth의 표준 콜백 처리와 공급자 바인딩이며 JWK 기반 서명 검증 자체의 회귀는 아니다.
 */
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { Auth, customFetch, type AuthConfig } from "@auth/core";
import { decode, encode } from "@auth/core/jwt";
import Google from "next-auth/providers/google";
import { vi } from "vitest";
import { createKakaoProvider } from "@/lib/kakao-provider";

export type ProviderId = "google" | "kakao";
export type CheckName = "pkce" | "state" | "nonce";

// 실제 URL이나 키와 혼동되지 않도록 앱 주소·클라이언트·암호 모두 테스트 전용으로 고정한다.
const APP_ORIGIN = "https://oauth-app.example.test";
const SECRET = "isolated-oauth-fixture-secret-for-provider-binding";
const CLIENT_ID = "synthetic-oauth-client";
const GOOGLE_ISSUER = "https://accounts.google.com";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

export const CHECK_COOKIES = {
  pkce: "__Secure-authjs.pkce.code_verifier",
  state: "__Secure-authjs.state",
  nonce: "__Secure-authjs.nonce",
} satisfies Record<CheckName, string>;
export const SESSION_COOKIE = "__Secure-authjs.session-token";

export interface LoginAttempt {
  provider: ProviderId;
  authorization: URL;
  cookies: Map<string, string>;
}

/** Set-Cookie의 속성은 전송하지 않고 브라우저가 보관하는 이름/값만 추출한다. */
export function responseCookies(response: Response): Map<string, string> {
  return new Map(response.headers.getSetCookie().map((header) => {
    const pair = header.split(";", 1)[0];
    const separator = pair.indexOf("=");
    return [pair.slice(0, separator), pair.slice(separator + 1)];
  }));
}

/** 내부 JWT 함수를 가로채지 않고 공개 API로 실제 암호화 쿠키를 검사한다. */
export async function decodeCookie(name: string, value: string) {
  return decode({ token: value, secret: SECRET, salt: name });
}

/** 이전 형식/변조된 값도 실제 JWE로 생성하여 복호화 실패와 바인딩 실패를 구분한다. */
export async function encodeCheckCookie(
  check: CheckName,
  value: string,
  provider?: string,
) {
  return encode({
    token: { value, ...(provider === undefined ? {} : { provider }) },
    secret: SECRET,
    salt: CHECK_COOKIES[check],
    maxAge: 900,
  });
}

/** 실제 Google 공급자 계약을 유지한 RS256 합성 ID 토큰을 만든다. */
function googleIdToken(nonce?: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "fixture-key" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: GOOGLE_ISSUER,
    aud: CLIENT_ID,
    sub: "google-synthetic-user",
    iat: now,
    exp: now + 300,
    name: "합성 구글 사용자",
    email: "google@example.test",
    email_verified: true,
    ...(nonce === undefined ? {} : { nonce }),
  })).toString("base64url");
  const input = `${header}.${payload}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
}

/** 기본은 운영과 동일한 PKCE, 강화 구성은 Google에 state/nonce, Kakao에 state를 추가한다. */
export function createOAuthFixture(
  hardened = false,
  options: { kakaoNonceForBoundary?: boolean; googleUserinfo?: boolean } = {},
) {
  const attempts = new Map<ProviderId, LoginAttempt>();
  const tokenRequests: ProviderId[] = [];
  const userinfoRequests: ProviderId[] = [];
  const errors: string[] = [];
  let googleNonceOverride: string | undefined;

  // DB를 호출하는 앱 콜백 경계에서 관찰한다. Auth.js 검증·교환·JWT 구현은 그대로 실행한다.
  const signIn = vi.fn<NonNullable<NonNullable<AuthConfig["callbacks"]>["signIn"]>>(() => true);
  const jwt = vi.fn<NonNullable<NonNullable<AuthConfig["callbacks"]>["jwt"]>>(({ token }) => token);

  /** 모든 외부 요청은 명시적으로 허용한 공급자 주소만 합성 응답으로 처리한다. */
  const providerFetch: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url === `${GOOGLE_ISSUER}/.well-known/openid-configuration`) {
      return Response.json({
        issuer: GOOGLE_ISSUER,
        authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
        token_endpoint: GOOGLE_TOKEN,
        userinfo_endpoint: GOOGLE_USERINFO,
        jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        code_challenge_methods_supported: ["S256"],
      });
    }
    const provider = url === GOOGLE_TOKEN ? "google"
      : url === "https://kauth.kakao.com/oauth/token" ? "kakao" : undefined;
    if (provider) {
      tokenRequests.push(provider);
      const attempt = attempts.get(provider);
      const body = new URLSearchParams(String(init?.body));
      const verifier = body.get("code_verifier");
      // 합성 인가 서버에서도 코드·리다이렉트·PKCE를 검사하여 무조건 성공하는 교환을 피한다.
      if (!attempt || body.get("code") !== `${provider}-synthetic-code`
        || body.get("grant_type") !== "authorization_code"
        || body.get("redirect_uri") !== `${APP_ORIGIN}/api/auth/callback/${provider}`
        || !verifier || createHash("sha256").update(verifier).digest("base64url")
          !== attempt.authorization.searchParams.get("code_challenge")) {
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      }
      return Response.json({
        access_token: `${provider}-synthetic-access-token`,
        token_type: "Bearer",
        expires_in: 300,
        ...(provider === "google" ? {
          id_token: googleIdToken(googleNonceOverride
            ?? attempt.authorization.searchParams.get("nonce") ?? undefined),
        } : {}),
      });
    }
    if (url === "https://kapi.kakao.com/v2/user/me") {
      userinfoRequests.push("kakao");
      return Response.json({
        id: 123456,
        kakao_account: {
          email: "kakao@example.test",
          is_email_valid: true,
          is_email_verified: true,
          profile: { nickname: "합성 카카오 사용자" },
        },
      });
    }
    if (url === GOOGLE_USERINFO) {
      userinfoRequests.push("google");
      return Response.json({
        sub: "google-synthetic-user", name: "합성 구글 사용자", email: "google@example.test",
      });
    }
    throw new Error("합성 공급자에서 허용하지 않은 외부 요청");
  };

  const google = Google({
    clientId: CLIENT_ID,
    clientSecret: "synthetic-client-secret",
    // 기본 OIDC 경로와 별도로 검증된 ID 토큰 이후 userinfo를 요청하는 공개 옵션도 검사한다.
    ...(options.googleUserinfo ? { idToken: false } : {}),
  });
  const kakao = createKakaoProvider(CLIENT_ID, "synthetic-client-secret", false);
  // 운영 기본 checks의 부재를 보존한다. 강화 구성에만 세 가지 검사를 추가한다.
  const providers = [google, kakao].map((provider) => ({
    ...provider,
    options: {
      ...provider.options,
      ...(hardened ? {
        // Kakao OAuth는 nonce를 지정하면 ID 토큰을 요구하므로 정상 구성에는 추가하지 않는다.
        // 경계 전용 옵션은 다른 공급자가 발급한 nonce 쿠키를 얻는 음성 테스트에만 사용한다.
        checks: (provider.id === "google" || options.kakaoNonceForBoundary
          ? ["pkce", "state", "nonce"] : ["pkce", "state"]) as CheckName[],
      } : {}),
      [customFetch]: providerFetch,
    },
  }));
  const config: AuthConfig = {
    basePath: "/api/auth",
    trustHost: true,
    secret: SECRET,
    providers,
    session: { strategy: "jwt" },
    callbacks: { signIn, jwt },
    logger: {
      // 로그에 코드/토큰/프로필을 출력하지 않고 오류의 유형만 기록한다.
      error(error) {
        errors.push("type" in error && typeof error.type === "string" ? error.type : error.name);
      },
      warn() {},
      debug() {},
    },
  };

  return {
    signIn, jwt, tokenRequests, userinfoRequests, errors,
    originalProviders: [google, kakao],
    overrideGoogleNonce(value: string) { googleNonceOverride = value; },
    /** 실제 CSRF 쿠키와 POST 로그인으로 검사용 쿠키를 발급받는다. */
    async begin(provider: ProviderId): Promise<LoginAttempt> {
      const csrfResponse = await Auth(new Request(`${APP_ORIGIN}/api/auth/csrf`), config);
      const csrfBody: { csrfToken: string } = await csrfResponse.json();
      const cookies = responseCookies(csrfResponse);
      const response = await Auth(new Request(`${APP_ORIGIN}/api/auth/signin/${provider}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookieHeader(cookies) },
        body: new URLSearchParams({ csrfToken: csrfBody.csrfToken, callbackUrl: APP_ORIGIN }),
      }), config);
      for (const [name, value] of responseCookies(response)) cookies.set(name, value);
      const location = response.headers.get("location");
      if (!location || response.status !== 302) throw new Error("합성 OAuth 로그인을 시작하지 못했습니다");
      const attempt = { provider, cookies, authorization: new URL(location) };
      attempts.set(provider, attempt);
      return attempt;
    },
    /** 수신 콜백을 실제 Auth 라우트로 넘겨 검증과 세션 생성 여부를 관찰한다. */
    async callback(attempt: LoginAttempt, state?: string) {
      const query = new URLSearchParams({ code: `${attempt.provider}-synthetic-code` });
      const expectedState = state ?? attempt.authorization.searchParams.get("state");
      if (expectedState !== null) query.set("state", expectedState);
      return Auth(new Request(`${APP_ORIGIN}/api/auth/callback/${attempt.provider}?${query}`, {
        headers: { cookie: cookieHeader(attempt.cookies) },
      }), config);
    },
  };
}

/** 쿠키 전송은 실제 브라우저의 Cookie 헤더 형식만 사용한다. */
function cookieHeader(cookies: Map<string, string>) {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}
