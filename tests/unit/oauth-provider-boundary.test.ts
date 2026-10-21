// @vitest-environment node
/**
 * #267: 설치된 Auth.js의 실제 공개 Auth API를 통과하는 OAuth 공급자 경계 회귀다.
 * 운영 기본 PKCE와 명시적으로 강화한 state/nonce 구성을 구분해 검증한다.
 * 네트워크/DB/운영 비밀 없이 공급자 혼동이 앱 콜백과 세션 발급 전에 차단되는지 확인한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHECK_COOKIES, SESSION_COOKIE, createOAuthFixture, decodeCookie,
  encodeCheckCookie, responseCookies, type CheckName, type ProviderId,
} from "../support/oauth-provider-fixture";

const PROVIDERS: ProviderId[] = ["google", "kakao"];
const CHECKS: CheckName[] = ["pkce", "state", "nonce"];

beforeEach(() => {
  // customFetch 누락은 테스트 실패로 드러내며 실제 인터넷 요청을 허용하지 않는다.
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("실제 네트워크 요청 금지"));
});
afterEach(() => vi.restoreAllMocks());

/** 실패 응답은 앱 인증 콜백에 도달하거나 세션 쿠키를 발급해서는 안 된다. */
function expectRejected(fixture: ReturnType<typeof createOAuthFixture>, response: Response) {
  expect(response.status).toBe(302);
  expect(new URL(response.headers.get("location")!).searchParams.has("error")).toBe(true);
  expect(fixture.signIn).not.toHaveBeenCalled();
  expect(fixture.jwt).not.toHaveBeenCalled();
  expect([...responseCookies(response).keys()].some((name) => name.startsWith(SESSION_COOKIE))).toBe(false);
  expect(globalThis.fetch).not.toHaveBeenCalled();
}

describe("실제 Auth.js OAuth 기본 구성", () => {
  it.each(PROVIDERS)("%s 기본 PKCE 코드 교환과 프로필·JWT 세션 발급에 성공한다", async (provider) => {
    const fixture = createOAuthFixture();
    const attempt = await fixture.begin(provider);
    const original = fixture.originalProviders.find((item) => item.id === provider)!;
    expect(original.checks).toBeUndefined();
    expect(original.options?.checks).toBeUndefined();
    expect(attempt.authorization.searchParams.get("code_challenge_method")).toBe("S256");
    expect(attempt.authorization.searchParams.get("code_challenge")).toBeTruthy();
    expect(attempt.authorization.searchParams.has("state")).toBe(false);
    expect(attempt.authorization.searchParams.has("nonce")).toBe(false);
    expect(attempt.cookies.has(CHECK_COOKIES.state)).toBe(false);
    expect(attempt.cookies.has(CHECK_COOKIES.nonce)).toBe(false);
    const check = await decodeCookie(CHECK_COOKIES.pkce, attempt.cookies.get(CHECK_COOKIES.pkce)!);
    expect(check).toMatchObject({ provider, value: expect.any(String) });

    const response = await fixture.callback(attempt);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://oauth-app.example.test");
    expect(fixture.errors).toEqual([]);
    expect(fixture.tokenRequests).toEqual([provider]);
    // Google 기본 OIDC는 ID 토큰의 검증된 claims를 사용하고 Kakao는 userinfo를 요청한다.
    expect(fixture.userinfoRequests).toEqual(provider === "kakao" ? ["kakao"] : []);
    expect(fixture.signIn).toHaveBeenCalledOnce();
    expect(fixture.signIn).toHaveBeenCalledWith(expect.objectContaining({
      account: expect.objectContaining({ provider, providerAccountId: provider === "google" ? "google-synthetic-user" : "123456" }),
      user: expect.objectContaining({ email: `${provider}@example.test` }),
    }));
    expect(fixture.jwt).toHaveBeenCalledOnce();
    const cookies = responseCookies(response);
    expect(await decodeCookie(SESSION_COOKIE, cookies.get(SESSION_COOKIE)!)).toMatchObject({ email: `${provider}@example.test` });
    expect(cookies.get(CHECK_COOKIES.pkce)).toBe("");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each(PROVIDERS)("%s 기본 PKCE 쿠키를 다른 공급자의 쿠키로 바꾸면 교환 전에 거부한다", async (provider) => {
    const fixture = createOAuthFixture();
    const target = await fixture.begin(provider);
    const donor = await fixture.begin(provider === "google" ? "kakao" : "google");
    target.cookies.set(CHECK_COOKIES.pkce, donor.cookies.get(CHECK_COOKIES.pkce)!);
    expectRejected(fixture, await fixture.callback(target));
    expect(fixture.errors).toEqual(["InvalidCheck"]);
    expect(fixture.tokenRequests).toEqual([]);
  });

  it.each(PROVIDERS)("%s 기본 PKCE 쿠키가 없으면 교환 전에 거부한다", async (provider) => {
    const fixture = createOAuthFixture();
    const target = await fixture.begin(provider);
    target.cookies.delete(CHECK_COOKIES.pkce);
    expectRejected(fixture, await fixture.callback(target));
    expect(fixture.errors).toEqual(["InvalidCheck"]);
    expect(fixture.tokenRequests).toEqual([]);
  });

  it("Google의 공개 idToken:false 옵션은 OIDC 검증 후 userinfo까지 조회한다", async () => {
    const fixture = createOAuthFixture(false, { googleUserinfo: true });
    const attempt = await fixture.begin("google");
    const response = await fixture.callback(attempt);
    expect(fixture.errors).toEqual([]);
    expect(fixture.tokenRequests).toEqual(["google"]);
    expect(fixture.userinfoRequests).toEqual(["google"]);
    expect(fixture.signIn).toHaveBeenCalledOnce();
    expect(fixture.jwt).toHaveBeenCalledOnce();
    expect(responseCookies(response).has(SESSION_COOKIE)).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("명시적으로 강화한 state·PKCE·nonce 구성", () => {
  it.each(PROVIDERS)("%s 동일 공급자의 검사용 쿠키는 모두 소비하고 정상 로그인한다", async (provider) => {
    const fixture = createOAuthFixture(true);
    const attempt = await fixture.begin(provider);
    const activeChecks = provider === "google" ? CHECKS : CHECKS.filter((check) => check !== "nonce");
    for (const check of activeChecks) {
      expect(await decodeCookie(CHECK_COOKIES[check], attempt.cookies.get(CHECK_COOKIES[check])!))
        .toMatchObject({ provider, value: expect.any(String) });
    }
    const response = await fixture.callback(attempt);
    expect(fixture.errors).toEqual([]);
    expect(fixture.signIn).toHaveBeenCalledOnce();
    expect(fixture.jwt).toHaveBeenCalledOnce();
    const cookies = responseCookies(response);
    expect(cookies.has(SESSION_COOKIE)).toBe(true);
    for (const check of activeChecks) expect(cookies.get(CHECK_COOKIES[check])).toBe("");
  });

  for (const provider of PROVIDERS) {
    for (const check of CHECKS) {
      // nonce는 OIDC인 Google에서 검증하며 Kakao OAuth의 정상 구성에는 요청하지 않는다.
      if (provider === "kakao" && check === "nonce") continue;
      it(`${provider}의 ${check} 쿠키가 다른 공급자에서 발급되면 거부한다`, async () => {
        const fixture = createOAuthFixture(true, { kakaoNonceForBoundary: check === "nonce" });
        const target = await fixture.begin(provider);
        const donor = await fixture.begin(provider === "google" ? "kakao" : "google");
        target.cookies.set(CHECK_COOKIES[check], donor.cookies.get(CHECK_COOKIES[check])!);
        expectRejected(fixture, await fixture.callback(target));
        expect(fixture.errors).toEqual(["InvalidCheck"]);
        // nonce는 실제 토큰 응답 수신 후 사용하며 state/PKCE는 교환 전에 검사한다.
        expect(fixture.tokenRequests).toEqual(check === "nonce" ? [provider] : []);
        expect(fixture.userinfoRequests).toEqual([]);
      });

      it(`${provider}의 ${check} 쿠키에 공급자 정보가 없는 이전 형식도 거부한다`, async () => {
        const fixture = createOAuthFixture(true);
        const target = await fixture.begin(provider);
        const original = await decodeCookie(CHECK_COOKIES[check], target.cookies.get(CHECK_COOKIES[check])!);
        expect(typeof original?.value).toBe("string");
        target.cookies.set(CHECK_COOKIES[check], await encodeCheckCookie(check, String(original?.value)));
        expectRejected(fixture, await fixture.callback(target));
        expect(fixture.errors).toEqual(["InvalidCheck"]);
        expect(fixture.tokenRequests).toEqual(check === "nonce" ? [provider] : []);
      });
    }
  }

  it.each(PROVIDERS)("%s state 응답 값이 쿠키와 다르면 코드 교환 전에 거부한다", async (provider) => {
    const fixture = createOAuthFixture(true);
    const target = await fixture.begin(provider);
    expectRejected(fixture, await fixture.callback(target, "synthetic-wrong-state"));
    expect(fixture.tokenRequests).toEqual([]);
    expect(fixture.errors).toEqual(["CallbackRouteError"]);
  });

  it.each(PROVIDERS)("%s 같은 공급자로 암호화된 잘못된 PKCE 값은 토큰 서버가 거부한다", async (provider) => {
    const fixture = createOAuthFixture(true);
    const target = await fixture.begin(provider);
    target.cookies.set(CHECK_COOKIES.pkce, await encodeCheckCookie("pkce", "wrong-verifier".repeat(4), provider));
    expectRejected(fixture, await fixture.callback(target));
    expect(fixture.tokenRequests).toEqual([provider]);
    expect(fixture.userinfoRequests).toEqual([]);
    expect(fixture.errors).toEqual(["CallbackRouteError"]);
  });

  it("Google ID 토큰의 nonce가 로그인 nonce와 다르면 앱 콜백 전에 거부한다", async () => {
    const fixture = createOAuthFixture(true);
    const target = await fixture.begin("google");
    fixture.overrideGoogleNonce("synthetic-wrong-nonce");
    expectRejected(fixture, await fixture.callback(target));
    expect(fixture.tokenRequests).toEqual(["google"]);
    expect(fixture.errors).toEqual(["CallbackRouteError"]);
  });
});
