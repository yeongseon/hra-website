/**
 * 이메일 로그인 조회에서 대소문자를 무시하고 중복 계정은 안전하게 거부합니다 (#130).
 */
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { query: { users: { findMany: mocks.findMany } } } }));

import { findCredentialUser } from "@/lib/auth-credentials";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("이메일 로그인 계정 조회", () => {
  it("입력 공백과 대소문자를 정규화해 한 계정을 찾는다", async () => {
    const user = { id: "회원", email: "Member@Example.com" };
    mocks.findMany.mockResolvedValue([user]);

    expect(await findCredentialUser("  MEMBER@EXAMPLE.COM  ")).toBe(user);
    const options = mocks.findMany.mock.calls[0][0];
    const query = new PgDialect().sqlToQuery(options.where);
    expect(query.sql).toContain("lower(");
    expect(query.params).toEqual(["member@example.com"]);
    expect(options.limit).toBe(2);
  });

  it("대소문자만 다른 계정이 둘이면 임의 계정을 선택하지 않는다", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "첫째", email: "Member@Example.com" },
      { id: "둘째", email: "member@example.com" },
    ]);
    expect(await findCredentialUser("member@example.com")).toBeNull();
  });
});
