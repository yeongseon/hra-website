/**
 * handleOAuthSignIn IO 조합 회귀 테스트 (#67, #81)
 *
 * 검증 대상 (src/lib/auth-signin.ts):
 *   signIn 콜백 본체가 결정 트리 (decideOAuthSignIn) 결과별로 SignInIO 를
 *   어떻게 조합해서 호출하는가. tests/unit/auth-jwt-session.test.ts 가 결정
 *   함수 자체를 검증한다면, 이 파일은 그 결정을 실제 IO 로 옮기는 접합부
 *   (dual SELECT / INSERT / UPDATE / redirect / user.email mutation) 를 검증한다.
 *
 * 커버리지 축:
 *   1) SELECT 단계: findByBinding / findByEmail 이 어떤 인자로 몇 번 호출되는가
 *   2) allow-existing 분기: updateProfile 이 호출되는 조건과 payload
 *   3) allow-new 분기: insertNew payload (특히 name fallback, role, binding)
 *   4) block 3종 (local-account / legacy-unbound / provider-mismatch):
 *      redirect string 반환 + INSERT/UPDATE 절대 호출 안 됨
 *   5) 부수효과: user.email mutation (kakao placeholder 포함)
 *   6) 안전 불변식: allow-existing UPDATE 에 binding 필드가 절대 포함되지 않음
 *
 * mock 전략:
 *   SignInIO 4 메서드 모두 vi.fn() 으로 만들고 기본은 findByBinding / findByEmail
 *   이 undefined 를 반환 (allow-new 흐름). 각 테스트에서 필요한 반환값만 오버라이드
 *   해서 시나리오를 조립한다. drizzle 자체는 mock 하지 않으며 어댑터의 SQL 정합성은
 *   scripts/verify-oauth-binding-security.mjs 프로덕션 스모크가 담당한다.
 *
 * import 경로 주의: auth.ts 는 NextAuth() 를 최상단에서 실행하므로 vitest 에서
 * import 하면 next-auth 내부의 next/server 참조가 module resolution 을 깨뜨린다.
 * 따라서 signIn 콜백 본체는 auth-signin.ts 에 상주하며 테스트도 그 모듈을 참조한다.
 */

import { describe, expect, it, vi } from "vitest";
import {
  handleOAuthSignIn,
  type OAuthSignInInput,
  type SignInIO,
} from "@/lib/auth-signin";
import { users } from "@/lib/db/schema";

type UserRow = typeof users.$inferSelect;
type UserInsert = typeof users.$inferInsert;

const UUID_BOUND = "11111111-2222-3333-4444-555555555555";
const UUID_EMAIL = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

/**
 * boundUser 로 채워 넣을 최소 UserRow (테스트 목적).
 *
 * $inferSelect 는 nullable 필드를 정확히 반영하므로 실제 컬럼 (name, image,
 * passwordHash, oauthProvider, oauthProviderAccountId, role, sessionVersion,
 * createdAt, updatedAt 등) 을 모두 갖춘 최소 shape 을 만든다. 특정 테스트에서
 * name/image 만 다르게 오버라이드하기 쉽도록 factory 로 노출한다.
 */
function makeBoundUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: UUID_BOUND,
    name: "기존 이름",
    email: "bound@example.com",
    emailVerified: null,
    image: "https://cdn/old.png",
    passwordHash: null,
    role: "MEMBER",
    cohortId: null,
    department: null,
    grade: null,
    university: null,
    phone: null,
    interests: null,
    motivation: null,
    approvedAt: new Date("2025-01-01"),
    approvedById: null,
    sessionVersion: 0,
    oauthProvider: "google",
    oauthProviderAccountId: "google-account-123",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  } as UserRow;
}

function makeEmailUser(overrides: Partial<UserRow> = {}): UserRow {
  return makeBoundUser({
    id: UUID_EMAIL,
    ...overrides,
  });
}

/**
 * 기본 SignInIO mock: 모든 SELECT 가 undefined 를 반환 → allow-new 흐름.
 * 각 테스트에서 필요한 메서드만 mockResolvedValueOnce 로 덮어써서 시나리오를 만든다.
 */
function makeMockIO(overrides: Partial<SignInIO> = {}): SignInIO {
  return {
    findByBinding: vi.fn().mockResolvedValue(undefined),
    findByEmail: vi.fn().mockResolvedValue(undefined),
    insertNew: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeInput(overrides: {
  user?: Partial<OAuthSignInInput["user"]>;
  account?: Partial<OAuthSignInInput["account"]>;
} = {}): OAuthSignInInput {
  return {
    user: {
      name: "홍길동",
      email: "user@example.com",
      image: "https://cdn/new.png",
      ...overrides.user,
    },
    account: {
      provider: "google",
      providerAccountId: "google-account-123",
      ...overrides.account,
    },
  };
}

describe("handleOAuthSignIn — SELECT 단계 (findByBinding / findByEmail)", () => {
  it("findByBinding 은 (provider, providerAccountId) 튜플로 호출된다", async () => {
    const io = makeMockIO();
    const input = makeInput();

    await handleOAuthSignIn(input, io);

    expect(io.findByBinding).toHaveBeenCalledTimes(1);
    expect(io.findByBinding).toHaveBeenCalledWith(
      "google",
      "google-account-123",
    );
  });

  it("kakao provider 는 provider 인자로 'kakao' 를 넘긴다", async () => {
    const io = makeMockIO();
    const input = makeInput({
      account: { provider: "kakao", providerAccountId: "kakao-999" },
    });

    await handleOAuthSignIn(input, io);

    expect(io.findByBinding).toHaveBeenCalledWith("kakao", "kakao-999");
  });

  it("email 이 있으면 findByEmail 은 그 email 로 호출된다", async () => {
    const io = makeMockIO();
    const input = makeInput({ user: { email: "real@example.com" } });

    await handleOAuthSignIn(input, io);

    expect(io.findByEmail).toHaveBeenCalledTimes(1);
    expect(io.findByEmail).toHaveBeenCalledWith("real@example.com");
  });

  it("email 이 null 이면 placeholder email 로 findByEmail 호출 (kakao 무이메일 경로)", async () => {
    // 카카오 비즈앱 심사 없이 로그인하면 email claim 이 오지 않는다.
    // 이 경우 provider + accountId 기반 결정적 placeholder 를 만든다.
    const io = makeMockIO();
    const input = makeInput({
      user: { email: null },
      account: { provider: "kakao", providerAccountId: "kakao-777" },
    });

    await handleOAuthSignIn(input, io);

    expect(io.findByEmail).toHaveBeenCalledWith(
      "kakao_kakao-777@oauth.placeholder",
    );
  });

  it("email 이 undefined 여도 동일한 placeholder 규칙이 적용된다", async () => {
    const io = makeMockIO();
    const input = makeInput({
      user: { email: undefined },
      account: { provider: "kakao", providerAccountId: "kakao-abc" },
    });

    await handleOAuthSignIn(input, io);

    expect(io.findByEmail).toHaveBeenCalledWith(
      "kakao_kakao-abc@oauth.placeholder",
    );
  });
});

describe("handleOAuthSignIn — allow-existing 분기 (boundUser 존재)", () => {
  it("name / image 가 동일하면 updateProfile 을 호출하지 않는다", async () => {
    const bound = makeBoundUser({
      name: "홍길동",
      image: "https://cdn/new.png",
    });
    const io = makeMockIO({
      findByBinding: vi.fn().mockResolvedValue(bound),
    });
    const input = makeInput({
      user: { name: "홍길동", image: "https://cdn/new.png" },
    });

    const result = await handleOAuthSignIn(input, io);

    expect(result).toBe(true);
    expect(io.updateProfile).not.toHaveBeenCalled();
    expect(io.insertNew).not.toHaveBeenCalled();
  });

  it("name 만 바뀌면 updateProfile 이 { name } 만 담아 호출된다", async () => {
    const bound = makeBoundUser({
      name: "옛이름",
      image: "https://cdn/new.png",
    });
    const io = makeMockIO({
      findByBinding: vi.fn().mockResolvedValue(bound),
    });
    const input = makeInput({
      user: { name: "새이름", image: "https://cdn/new.png" },
    });

    await handleOAuthSignIn(input, io);

    expect(io.updateProfile).toHaveBeenCalledTimes(1);
    expect(io.updateProfile).toHaveBeenCalledWith(UUID_BOUND, {
      name: "새이름",
    });
  });

  it("image 만 바뀌면 updateProfile 이 { image } 만 담아 호출된다", async () => {
    const bound = makeBoundUser({
      name: "홍길동",
      image: "https://cdn/old.png",
    });
    const io = makeMockIO({
      findByBinding: vi.fn().mockResolvedValue(bound),
    });
    const input = makeInput({
      user: { name: "홍길동", image: "https://cdn/new.png" },
    });

    await handleOAuthSignIn(input, io);

    expect(io.updateProfile).toHaveBeenCalledWith(UUID_BOUND, {
      image: "https://cdn/new.png",
    });
  });

  it("name/image 둘 다 바뀌면 updateProfile 이 둘 다 담아 호출된다", async () => {
    const bound = makeBoundUser({
      name: "옛이름",
      image: "https://cdn/old.png",
    });
    const io = makeMockIO({
      findByBinding: vi.fn().mockResolvedValue(bound),
    });
    const input = makeInput({
      user: { name: "새이름", image: "https://cdn/new.png" },
    });

    await handleOAuthSignIn(input, io);

    expect(io.updateProfile).toHaveBeenCalledWith(UUID_BOUND, {
      name: "새이름",
      image: "https://cdn/new.png",
    });
  });

  it("provider 가 빈 name 을 주면 updateProfile 에 name 을 포함시키지 않는다", async () => {
    // provider 가 빈 문자열 name 을 주는 경우 (드물지만 관측 가능) 기존 이름을
    // 지워버리면 안 된다.
    const bound = makeBoundUser({ name: "기존", image: "https://cdn/new.png" });
    const io = makeMockIO({
      findByBinding: vi.fn().mockResolvedValue(bound),
    });
    const input = makeInput({
      user: { name: "", image: "https://cdn/new.png" },
    });

    await handleOAuthSignIn(input, io);

    expect(io.updateProfile).not.toHaveBeenCalled();
  });

  it("provider 가 null image 를 주면 updateProfile 에 image 를 포함시키지 않는다", async () => {
    const bound = makeBoundUser({
      name: "홍길동",
      image: "https://cdn/existing.png",
    });
    const io = makeMockIO({
      findByBinding: vi.fn().mockResolvedValue(bound),
    });
    const input = makeInput({
      user: { name: "홍길동", image: null },
    });

    await handleOAuthSignIn(input, io);

    expect(io.updateProfile).not.toHaveBeenCalled();
  });

  it("updateProfile payload 에 binding 필드가 절대 포함되지 않는다 (핵심 안전 불변식)", async () => {
    // #67 근본 방어: 재로그인 시 (oauthProvider, oauthProviderAccountId) 는
    // 절대 갱신되지 않아야 한다. race condition 이나 cross-provider takeover 방지.
    const bound = makeBoundUser({
      name: "옛이름",
      image: "https://cdn/old.png",
      oauthProvider: "google",
      oauthProviderAccountId: "original-id",
    });
    const io = makeMockIO({
      findByBinding: vi.fn().mockResolvedValue(bound),
    });
    const input = makeInput({
      user: { name: "새이름", image: "https://cdn/new.png" },
      account: { provider: "google", providerAccountId: "attacker-id" },
    });

    await handleOAuthSignIn(input, io);

    expect(io.updateProfile).toHaveBeenCalledTimes(1);
    const [, updates] = (io.updateProfile as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(updates).not.toHaveProperty("oauthProvider");
    expect(updates).not.toHaveProperty("oauthProviderAccountId");
    expect(updates).not.toHaveProperty("role");
    expect(updates).not.toHaveProperty("passwordHash");
    expect(updates).not.toHaveProperty("email");
  });

  it("insertNew 는 절대 호출되지 않는다 (기존 계정 우선)", async () => {
    const bound = makeBoundUser({ name: "홍길동" });
    const io = makeMockIO({
      findByBinding: vi.fn().mockResolvedValue(bound),
    });

    await handleOAuthSignIn(makeInput(), io);

    expect(io.insertNew).not.toHaveBeenCalled();
  });
});

describe("handleOAuthSignIn — allow-new 분기 (신규 계정)", () => {
  it("Google + name 존재 → insertNew payload 가 완전히 채워진다", async () => {
    const io = makeMockIO();
    const input = makeInput({
      user: {
        name: "홍길동",
        email: "new@example.com",
        image: "https://cdn/new.png",
      },
      account: { provider: "google", providerAccountId: "google-new-1" },
    });

    const result = await handleOAuthSignIn(input, io);

    expect(result).toBe(true);
    expect(io.insertNew).toHaveBeenCalledTimes(1);

    const [payload] = (io.insertNew as ReturnType<typeof vi.fn>).mock
      .calls[0] as [UserInsert];

    expect(payload).toMatchObject({
      name: "홍길동",
      email: "new@example.com",
      image: "https://cdn/new.png",
      role: "PENDING",
      oauthProvider: "google",
      oauthProviderAccountId: "google-new-1",
    });
  });

  it("Google + name 없음 → '구글 사용자' fallback", async () => {
    const io = makeMockIO();
    const input = makeInput({
      user: { name: null, email: "new@example.com", image: null },
      account: { provider: "google", providerAccountId: "google-new-2" },
    });

    await handleOAuthSignIn(input, io);

    const [payload] = (io.insertNew as ReturnType<typeof vi.fn>).mock
      .calls[0] as [UserInsert];
    expect(payload.name).toBe("구글 사용자");
  });

  it("Kakao + name 없음 → '카카오 사용자' fallback", async () => {
    const io = makeMockIO();
    const input = makeInput({
      user: { name: null, email: null, image: null },
      account: { provider: "kakao", providerAccountId: "kakao-new-1" },
    });

    await handleOAuthSignIn(input, io);

    const [payload] = (io.insertNew as ReturnType<typeof vi.fn>).mock
      .calls[0] as [UserInsert];
    expect(payload.name).toBe("카카오 사용자");
  });

  it("name 이 공백만 있으면 provider 별 한국어 기본값으로 대체된다 (trim 후 판정)", async () => {
    const io = makeMockIO();
    const input = makeInput({
      user: { name: "   ", email: "space@example.com" },
      account: { provider: "google", providerAccountId: "google-new-3" },
    });

    await handleOAuthSignIn(input, io);

    const [payload] = (io.insertNew as ReturnType<typeof vi.fn>).mock
      .calls[0] as [UserInsert];
    expect(payload.name).toBe("구글 사용자");
  });

  it("Kakao email null → placeholder email 이 insertNew.email 로 그대로 저장된다", async () => {
    const io = makeMockIO();
    const input = makeInput({
      user: { email: null },
      account: { provider: "kakao", providerAccountId: "kakao-new-2" },
    });

    await handleOAuthSignIn(input, io);

    const [payload] = (io.insertNew as ReturnType<typeof vi.fn>).mock
      .calls[0] as [UserInsert];
    expect(payload.email).toBe("kakao_kakao-new-2@oauth.placeholder");
  });

  it("신규 계정은 role='PENDING' 으로 고정된다 (관리자 승인 대기)", async () => {
    const io = makeMockIO();
    await handleOAuthSignIn(makeInput(), io);

    const [payload] = (io.insertNew as ReturnType<typeof vi.fn>).mock
      .calls[0] as [UserInsert];
    expect(payload.role).toBe("PENDING");
  });

  it("updateProfile 은 절대 호출되지 않는다 (allow-new 는 INSERT 만)", async () => {
    const io = makeMockIO();
    await handleOAuthSignIn(makeInput(), io);
    expect(io.updateProfile).not.toHaveBeenCalled();
  });
});

describe("handleOAuthSignIn — block 3종 (redirect + no writes)", () => {
  it("block(local-account): 로컬 자격 있는 email 사용자 → redirect string 반환, 쓰기 없음", async () => {
    // emailUser 가 passwordHash 를 갖고 있으면 로컬 계정과의 자동 병합을 금지한다.
    const emailUser = makeEmailUser({
      passwordHash: "$2b$12$fakehash",
      oauthProvider: null,
      oauthProviderAccountId: null,
    });
    const io = makeMockIO({
      findByBinding: vi.fn().mockResolvedValue(undefined),
      findByEmail: vi.fn().mockResolvedValue(emailUser),
    });

    const result = await handleOAuthSignIn(makeInput(), io);

    expect(result).toBe("/login?error=OAuthAccountNotLinked");
    expect(io.insertNew).not.toHaveBeenCalled();
    expect(io.updateProfile).not.toHaveBeenCalled();
  });

  it("block(legacy-unbound): binding null/null 인 소셜 사용자 → redirect string 반환, 쓰기 없음", async () => {
    // 자동 backfill 금지 (Oracle #67 BLOCK 근거).
    const emailUser = makeEmailUser({
      passwordHash: null,
      oauthProvider: null,
      oauthProviderAccountId: null,
    });
    const io = makeMockIO({
      findByBinding: vi.fn().mockResolvedValue(undefined),
      findByEmail: vi.fn().mockResolvedValue(emailUser),
    });

    const result = await handleOAuthSignIn(makeInput(), io);

    expect(result).toBe("/login?error=OAuthAccountNotLinked");
    expect(io.insertNew).not.toHaveBeenCalled();
    expect(io.updateProfile).not.toHaveBeenCalled();
  });

  it("block(provider-mismatch): 이미 다른 provider 로 binding 된 email → redirect string 반환, 쓰기 없음", async () => {
    // 같은 email 이 이미 kakao 에 binding 됐는데 google 로 로그인 시도 → 인수 차단.
    const emailUser = makeEmailUser({
      passwordHash: null,
      oauthProvider: "kakao",
      oauthProviderAccountId: "kakao-existing",
    });
    const io = makeMockIO({
      findByBinding: vi.fn().mockResolvedValue(undefined),
      findByEmail: vi.fn().mockResolvedValue(emailUser),
    });

    const result = await handleOAuthSignIn(
      makeInput({
        account: { provider: "google", providerAccountId: "google-attacker" },
      }),
      io,
    );

    expect(result).toBe("/login?error=OAuthAccountNotLinked");
    expect(io.insertNew).not.toHaveBeenCalled();
    expect(io.updateProfile).not.toHaveBeenCalled();
  });
});

describe("handleOAuthSignIn — 부수효과 (user.email mutation)", () => {
  it("Google + email 존재 → user.email 은 그대로 유지된다", async () => {
    // 후속 jwt 콜백이 token.email 로 DB 조회할 때 사용될 값을 심는다.
    // email 이 이미 있으면 덮어써도 동일한 값이어야 한다.
    const io = makeMockIO();
    const input = makeInput({ user: { email: "keep@example.com" } });

    await handleOAuthSignIn(input, io);

    expect(input.user.email).toBe("keep@example.com");
  });

  it("Kakao email null → user.email 이 placeholder 로 채워진다 (jwt 콜백 조회용)", async () => {
    // NextAuth 후속 jwt 콜백이 token.email 을 통해 users 를 조회하는데,
    // kakao placeholder email 을 심어둬야 방금 INSERT 된 사용자를 찾을 수 있다.
    const io = makeMockIO();
    const input = makeInput({
      user: { email: null },
      account: { provider: "kakao", providerAccountId: "kakao-mut-1" },
    });

    await handleOAuthSignIn(input, io);

    expect(input.user.email).toBe("kakao_kakao-mut-1@oauth.placeholder");
  });

  it("block 분기여도 user.email mutation 은 발생하지 않는다 (redirect 이후 세션 미생성)", async () => {
    // block 은 redirect 로 세션 없이 종료되므로 후속 jwt 콜백이 실행되지 않는다.
    // 따라서 user.email mutation 은 무의미하며 발생해서도 안 된다.
    const emailUser = makeEmailUser({ passwordHash: "$2b$12$fakehash" });
    const io = makeMockIO({
      findByEmail: vi.fn().mockResolvedValue(emailUser),
    });
    const input = makeInput({ user: { email: "victim@example.com" } });
    const originalEmail = input.user.email;

    await handleOAuthSignIn(input, io);

    expect(input.user.email).toBe(originalEmail);
  });
});
