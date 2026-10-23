// @vitest-environment node
/**
 * 본인 프로필 서비스의 실제 PostgreSQL 행 조회와 역할 경계를 검증합니다.
 * 합성 계정만 사용하고 Neon 요청은 소유 임시 DB의 Unix 소켓으로 제한합니다.
 */
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "../support/neon-psql-transport.mjs";

const mocks = vi.hoisted(() => ({ database: undefined as NeonHttpDatabase<typeof schema> | undefined }));

vi.mock("@/lib/db", () => ({
  get db() {
    if (!mocks.database) throw new Error("격리 DB 준비 전 호출");
    return mocks.database;
  },
}));

import { getCurrentProfile } from "@/features/users/me/service";

const bin = process.env.HRA_TEST_PG_BIN;
const ids = {
  pending: "70000000-0000-4000-8000-000000000001",
  admin: "70000000-0000-4000-8000-000000000002",
  member: "70000000-0000-4000-8000-000000000003",
  legacy: "71111111-1111-1111-1111-111111111111",
  missing: "70000000-0000-4000-8000-000000000099",
  cohort: "80000000-0000-4000-8000-000000000001",
};

describe.skipIf(!bin)("API v1 본인 프로필 실제 PostgreSQL 경계", () => {
  let cluster: ReturnType<typeof createQaPostgres> | undefined;
  let postCount = 0;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    // 현재 Drizzle의 사용자 역할·프로필 열을 그대로 둔 최소 합성 스키마입니다.
    cluster.sql(`
      CREATE TYPE user_role AS ENUM ('ADMIN', 'FACULTY', 'MEMBER', 'PENDING');
      CREATE TABLE cohorts(id uuid PRIMARY KEY);
      CREATE TABLE users (
        id uuid PRIMARY KEY, name varchar(100) NOT NULL, email varchar(255) NOT NULL,
        role user_role NOT NULL, cohort_id uuid REFERENCES cohorts(id), image text,
        password_hash text, oauth_provider text, oauth_provider_account_id text,
        session_version integer NOT NULL DEFAULT 0
      );
      INSERT INTO cohorts(id) VALUES ('${ids.cohort}');
      INSERT INTO users(id,name,email,role,cohort_id,image,password_hash,oauth_provider,oauth_provider_account_id,session_version) VALUES
        ('${ids.pending}', '합성 대기 사용자', 'kakao_123@oauth.placeholder', 'PENDING', NULL, NULL, '비공개 해시', 'kakao', '비공개 바인딩', 7),
        ('${ids.admin}', '합성 관리자', 'admin@profile.invalid', 'ADMIN', NULL, NULL, '비공개 해시', NULL, NULL, 3),
        ('${ids.member}', '합성 회원', 'member@profile.invalid', 'MEMBER', NULL, NULL, '비공개 해시', NULL, NULL, 2),
        ('${ids.legacy}', '합성 기존 계정', 'legacy@profile.invalid', 'PENDING', NULL, NULL, '비공개 해시', NULL, NULL, 1);
    `);

    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || options.method !== "POST" ||
          new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) {
        throw new Error("격리 SQL 범위 이외 요청 차단");
      }
      postCount++;
      try {
        return Response.json(await transport(JSON.parse(String(options.body))));
      } catch {
        return Response.json({ message: "격리 SQL 실행 거부", code: "QA_TRANSPORT_ERROR" }, { status: 400 });
      }
    };
    mocks.database = drizzle(neon(qaDatabaseUrl), { schema });
  }, 60_000);

  afterAll(() => {
    neonConfig.fetchFunction = previousFetch;
    neonConfig.fetchEndpoint = previousEndpoint;
    mocks.database = undefined;
    const ownedRoot = cluster?.root;
    cluster?.close();
    if (ownedRoot) expect(existsSync(ownedRoot)).toBe(false);
  });

  it("PENDING과 ADMIN은 자신의 여섯 표시 필드만 읽고 내부 인증 열은 반환하지 않는다", async () => {
    postCount = 0;
    const pending = await getCurrentProfile({ userId: ids.pending, role: "PENDING" });
    const admin = await getCurrentProfile({ userId: ids.admin, role: "ADMIN" });

    expect(pending).toEqual({
      id: ids.pending, name: "합성 대기 사용자", email: "kakao_123@oauth.placeholder",
      role: "PENDING", cohortId: null, image: null,
    });
    expect(admin).toEqual({
      id: ids.admin, name: "합성 관리자", email: "admin@profile.invalid",
      role: "ADMIN", cohortId: null, image: null,
    });
    expect(Object.keys(pending ?? {})).toEqual(["id", "name", "email", "role", "cohortId", "image"]);
    expect(JSON.stringify({ pending, admin })).not.toMatch(/passwordHash|sessionVersion|oauthProvider/);
    expect(postCount).toBe(2); // 각 사용자 조회는 추가 데이터 fetch 없이 한 번의 SQL로 끝납니다.
  });

  it("같은 회원의 기수·사진 변경은 다음 본인 조회에 반영한다", async () => {
    const before = await getCurrentProfile({ userId: ids.member, role: "MEMBER" });
    expect(before?.cohortId).toBeNull();
    expect(before?.image).toBeNull();

    cluster?.sql(`UPDATE users SET cohort_id='${ids.cohort}', image='https://profile.invalid/avatar.webp' WHERE id='${ids.member}';`);
    const after = await getCurrentProfile({ userId: ids.member, role: "MEMBER" });
    expect(after?.cohortId).toBe(ids.cohort);
    expect(after?.image).toBe("https://profile.invalid/avatar.webp");
    expect(after?.id).toBe(ids.member);
  });

  it("기존 인증 계약이 허용하는 비RFC variant UUID도 본인 행으로 조회한다", async () => {
    postCount = 0;
    const actual = await getCurrentProfile({ userId: ids.legacy, role: "PENDING" });
    expect(actual).toEqual({
      id: ids.legacy, name: "합성 기존 계정", email: "legacy@profile.invalid",
      role: "PENDING", cohortId: null, image: null,
    });
    expect(postCount).toBe(1);
  });

  it("없는 ID와 바뀐 역할은 null로 차단하고 잘못된 UUID는 DB를 열지 않는다", async () => {
    expect(await getCurrentProfile({ userId: ids.missing, role: "PENDING" })).toBeNull();

    cluster?.sql(`UPDATE users SET role='MEMBER' WHERE id='${ids.pending}';`);
    expect(await getCurrentProfile({ userId: ids.pending, role: "PENDING" })).toBeNull();

    postCount = 0;
    expect(await getCurrentProfile({ userId: "not-a-uuid", role: "ADMIN" })).toBeNull();
    expect(postCount).toBe(0);
  });
});
