/**
 * jwt 콜백 pure helper 회귀 테스트 (#68, #74)
 *
 * 검증 대상 (src/lib/auth-session.ts):
 *   - pickJwtLookupCriteria: DB 조회 우선순위 (UUID id → email fallback → null)
 *   - resolveJwtSession: 세션 무효화 판단
 *     · dbUser 없음 → null (계정 삭제 시나리오)
 *     · sessionVersion 불일치 → null (권한 변경 후 강제 로그아웃)
 *     · sessionVersion undefined (bootstrap) → 통과, DB 값을 심음
 *     · 정상 → id/role/name/sessionVersion 을 DB 값으로 덮어써 stale 방지
 *
 * 이 테스트는 db mock 없이 pure function 만 검증하므로 세션 무효화 규칙의
 * 회귀만 좁게 검증한다. drizzle findFirst 통합 동작은 Playwright E2E 몫이다.
 *
 * import 경로 주의: auth.ts 는 NextAuth() 를 최상단에서 실행하므로 vitest 에서
 * import 하면 next-auth 내부의 next/server 참조가 module resolution 을 깨뜨린다.
 * 그래서 pure helper 는 auth-session.ts 로 분리했고, 여기서도 그 파일을 참조한다.
 */

import { describe, expect, it } from "vitest";
import type { JWT } from "next-auth/jwt";
import {
  pickJwtLookupCriteria,
  resolveJwtSession,
  type SessionUser,
} from "@/lib/auth-session";

// Postgres UUID 컬럼 형식 (8-4-4-4-12) 을 만족하는 fixture.
const UUID_A = "a3f9b1c2-4d5e-4f6a-8b7c-9d0e1f2a3b4c";

describe("pickJwtLookupCriteria", () => {
  it("유효한 UUID id 가 있으면 id 기준 조회 조건을 반환한다", () => {
    const token = { id: UUID_A, email: "user@example.com" } as JWT;
    expect(pickJwtLookupCriteria(token)).toEqual({ by: "id", value: UUID_A });
  });

  it("id 가 없고 email 만 있으면 email 로 fallback 한다", () => {
    const token = { email: "user@example.com" } as JWT;
    expect(pickJwtLookupCriteria(token)).toEqual({
      by: "email",
      value: "user@example.com",
    });
  });

  it("id 가 UUID 형식이 아니면 email 로 fallback 한다 (조작 방어)", () => {
    // 프론트에서 개발자 툴로 조작한 토큰 등에 대비.
    const token = {
      id: "not-a-uuid",
      email: "user@example.com",
    } as unknown as JWT;
    expect(pickJwtLookupCriteria(token)).toEqual({
      by: "email",
      value: "user@example.com",
    });
  });

  it("id 도 없고 email 도 없으면 null 을 반환한다 (bootstrap 실패)", () => {
    const token = {} as JWT;
    expect(pickJwtLookupCriteria(token)).toBeNull();
  });

  it("email 이 빈 문자열이면 fallback 하지 않는다", () => {
    const token = { email: "" } as JWT;
    expect(pickJwtLookupCriteria(token)).toBeNull();
  });

  it("email 이 non-string 이면 fallback 하지 않는다 (런타임 방어)", () => {
    // JWT 타입 상 email 은 string | null | undefined 지만
    // 오래된 세션이나 조작된 토큰에 대비한 런타임 방어.
    const token = { email: 42 as unknown as string } as JWT;
    expect(pickJwtLookupCriteria(token)).toBeNull();
  });
});

describe("resolveJwtSession", () => {
  const dbUser: SessionUser = {
    id: UUID_A,
    role: "MEMBER",
    name: "홍길동",
    sessionVersion: 3,
  };

  it("dbUser 가 undefined 이면 null 을 반환한다 (계정 삭제 시나리오)", () => {
    const token = { id: UUID_A, sessionVersion: 3 } as JWT;
    expect(resolveJwtSession(token, undefined)).toBeNull();
  });

  it("dbUser 가 null 이어도 null 을 반환한다 (findFirst null 방어)", () => {
    const token = { id: UUID_A, sessionVersion: 3 } as JWT;
    expect(resolveJwtSession(token, null)).toBeNull();
  });

  it("token.sessionVersion 이 undefined 면 통과하고 DB 값을 심는다 (bootstrap)", () => {
    // 최초 발급 또는 마이그레이션 이전 세션.
    const token = { id: UUID_A, email: "user@example.com" } as JWT;
    const result = resolveJwtSession(token, dbUser);
    expect(result).not.toBeNull();
    expect(result?.sessionVersion).toBe(3);
    expect(result?.role).toBe("MEMBER");
    expect(result?.name).toBe("홍길동");
  });

  it("token.sessionVersion 이 DB 값과 같으면 통과하고 필드를 덮어쓴다", () => {
    const token = { id: UUID_A, sessionVersion: 3, role: "MEMBER" } as JWT;
    const result = resolveJwtSession(token, dbUser);
    expect(result).toBe(token);
    expect(result?.id).toBe(UUID_A);
    expect(result?.role).toBe("MEMBER");
    expect(result?.sessionVersion).toBe(3);
  });

  it("token.sessionVersion 이 DB 값보다 낮으면 null 을 반환한다 (revoke)", () => {
    // updateUserGroup 이 role/cohort 변경 시 sessionVersion 을 +1 하므로
    // 다른 디바이스의 오래된 토큰은 이 분기로 무효화된다.
    const token = { id: UUID_A, sessionVersion: 2 } as JWT;
    expect(resolveJwtSession(token, dbUser)).toBeNull();
  });

  it("token.sessionVersion 이 DB 값보다 높아도 null 을 반환한다 (엄격 equality)", () => {
    // 정상 흐름에서는 발생 불가하지만, 토큰 조작 방어를 위해 정확 일치를 강제한다.
    const token = { id: UUID_A, sessionVersion: 99 } as JWT;
    expect(resolveJwtSession(token, dbUser)).toBeNull();
  });

  it("email fallback 조회 후 dbUser.id 를 token.id 에 채운다", () => {
    // credentials 로그인 초기에는 token.id 가 없어 email 로 fallback 하고,
    // 이후 요청부터 id 우선 조회가 가능하도록 dbUser.id 를 심는다.
    const token = { email: "user@example.com" } as JWT;
    const result = resolveJwtSession(token, dbUser);
    expect(result?.id).toBe(UUID_A);
  });

  it("token 의 stale role 을 DB 값으로 덮어써 권한 상승 우회를 막는다", () => {
    // sessionVersion 이 우연히 같더라도 token 이 조작된 경우 role 은 반드시 DB 값이 승리한다.
    const token = {
      id: UUID_A,
      sessionVersion: 3,
      role: "ADMIN",
    } as JWT;
    const result = resolveJwtSession(token, dbUser);
    expect(result?.role).toBe("MEMBER");
  });

  it("dbUser.name 이 null 이어도 안전하게 심는다 (소셜 로그인 초기 상태)", () => {
    const anonymousUser: SessionUser = {
      id: UUID_A,
      role: "PENDING",
      name: null,
      sessionVersion: 0,
    };
    const token = { id: UUID_A } as JWT;
    const result = resolveJwtSession(token, anonymousUser);
    expect(result).not.toBeNull();
    expect(result?.name).toBeNull();
  });
});
