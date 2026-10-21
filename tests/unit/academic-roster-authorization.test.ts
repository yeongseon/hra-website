// @vitest-environment node
/** 실제 인증 설정의 authorized 콜백이 학사 경계에서 boolean false 대신 명시 응답을 반환하는지 검증한다. */
import type { NextAuthConfig, Session } from "next-auth";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const capture = vi.hoisted(() => ({ config: undefined as NextAuthConfig | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("next-auth", () => ({
  default: (config: NextAuthConfig) => {
    capture.config = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));
// 인증 설정은 실제 모듈에서 얻되 DB와 소셜 로그인 부수 작업은 실행하지 않는다.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth-signin", () => ({ createDrizzleSignInIO: vi.fn(), handleOAuthSignIn: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ releaseSuccessfulLogin: vi.fn(), reserveLoginAttempt: vi.fn() }));
import "@/lib/auth";

const actor = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
type Role = "ADMIN" | "FACULTY" | "MEMBER" | "PENDING";
const session = (role: Role, id = actor): Session => ({ user: { id, role, name: "시험 계정", email: "fixture@example.invalid" }, expires: "2099-01-01T00:00:00Z" });
async function authorize(path: string, auth: Session | null) {
  const callback = capture.config?.callbacks?.authorized;
  if (!callback) throw new Error("실제 authorized 콜백을 확인하지 못했습니다.");
  return callback({ auth, request: new NextRequest(`http://localhost:3100${path}`) });
}
beforeEach(() => vi.stubEnv("ACADEMIC_APPROVER_USER_ID", actor));
afterEach(() => vi.unstubAllEnvs());

describe("학사 경로의 명시적인 인증 거부 응답", () => {
  it.each(["ADMIN", "FACULTY", "MEMBER"] as const)("미지정 %s는 403 한국어 응답으로 차단한다", async role => {
    const result = await authorize("/admin/academics/students", session(role, other));
    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error("명시적인 거부 응답이 필요합니다.");
    expect(result.status).toBe(403);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(result.headers.get("content-type")).toContain("text/plain; charset=utf-8");
    expect(await result.text()).toBe("학사 운영 책임자만 접근할 수 있습니다.");
  });
  it.each(["ADMIN", "FACULTY", "MEMBER"] as const)("지정 승인자 %s는 학사 경로에 접근한다", async role => {
    expect(await authorize("/admin/academics/students", session(role))).toBe(true);
  });
  it("승인 대기 계정은 지정 여부와 관계없이 대기 안내로 이동한다", async () => {
    for (const id of [actor, other]) {
      const result = await authorize("/admin/academics/students", session("PENDING", id));
      expect(result).toBeInstanceOf(Response);
      if (!(result instanceof Response)) throw new Error("대기 안내 이동 응답이 필요합니다.");
      expect(result.status).toBe(302);
      expect(new URL(result.headers.get("location")!).pathname).toBe("/pending");
    }
  });
  it("비로그인은 콜백 경로를 보존하여 로그인으로 이동한다", async () => {
    const result = await authorize("/admin/academics/students", null);
    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error("로그인 이동 응답이 필요합니다.");
    const location = new URL(result.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackUrl")).toBe("/admin/academics/students");
  });
  it("비슷한 접두어는 일반 홈페이지 관리자 경계를 유지한다", async () => {
    // 학사 경로와 비슷한 접두어도 일반 관리자 전용이며 실제 래퍼가 처리할 응답으로 거부한다.
    for (const path of ["/admin/academics-extra", "/admin/users"]) {
      const result = await authorize(path, session("FACULTY"));
      expect(result).toBeInstanceOf(Response);
      if (!(result instanceof Response)) throw new Error("명시적인 관리자 거부 응답이 필요합니다.");
      expect(result.status).toBe(403);
      expect(result.headers.get("cache-control")).toBe("no-store");
      expect(await result.text()).toBe("관리자만 접근할 수 있습니다.");
    }
    expect(await authorize("/admin/users", session("ADMIN", other))).toBe(true);
  });
  it("학사 기본 경로와 상세 하위 경로 모두 같은 응답으로 거부한다", async () => {
    for (const path of ["/admin/academics", `/admin/academics/students/${other}`]) {
      const result = await authorize(path, session("ADMIN", other));
      expect(result instanceof Response && result.status).toBe(403);
    }
  });
});
