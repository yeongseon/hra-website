// @vitest-environment node
/**
 * #272 공용 API v1 공통 오류·상태 매핑·시각(UTC wire vs 달력 날짜)·페이지네이션·whitelist DTO 계약을 검증합니다.
 */
import { describe, expect, it } from "vitest";
import { USER_ROLES } from "@/lib/auth-session";
import {
  API_V1_DEFAULT_ERROR_MESSAGES,
  API_V1_DEFAULT_PAGE_SIZE,
  API_V1_ERROR_CODES,
  API_V1_ERROR_STATUS_BY_CODE,
  API_V1_MAX_PAGE_SIZE,
  API_V1_MVP_DOMAINS,
  apiV1CalendarDateSchema,
  apiV1ErrorResponseSchema,
  apiV1MeResponseSchema,
  apiV1NoticeSummarySchema,
  apiV1PageMetaSchema,
  apiV1PaginationQuerySchema,
  apiV1TimestampSchema,
  getApiV1ErrorHttpStatus,
  toApiV1ErrorResponse,
  toApiV1MeResponse,
  toApiV1NoticeSummary,
  toApiV1PageMeta,
  toApiV1Timestamp,
} from "@/contracts/api-v1";

const requestId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const cohortId = "33333333-3333-4333-8333-333333333333";
const noticeId = "44444444-4444-4444-8444-444444444444";

describe("#272 API v1 공통 오류 및 HTTP 상태 매핑 계약", () => {
  it("8개 최소 MVP 도메인 목록을 고정한다", () => {
    expect(API_V1_MVP_DOMAINS).toEqual([
      "me",
      "notices",
      "schedule",
      "resources",
      "assignments",
      "submissions",
      "upload",
      "download",
    ]);
  });

  it("인증·인가·검증·한도 초과·비활성·충돌·스토리지 실패의 HTTP 상태와 기본 한국어 문구를 매핑한다", () => {
    expect(API_V1_ERROR_STATUS_BY_CODE).toEqual({
      INVALID_INPUT: 400,
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      TOO_LARGE: 413,
      RATE_LIMITED: 429,
      DISABLED: 503,
      STORAGE_UNAVAILABLE: 503,
      UNAVAILABLE: 503,
    });

    for (const code of API_V1_ERROR_CODES) {
      expect(getApiV1ErrorHttpStatus(code)).toBe(API_V1_ERROR_STATUS_BY_CODE[code]);
      const response = toApiV1ErrorResponse({ code, requestId });
      expect(apiV1ErrorResponseSchema.parse(response)).toEqual({
        error: {
          code,
          message: API_V1_DEFAULT_ERROR_MESSAGES[code],
          requestId,
        },
      });
    }
  });

  it("RATE_LIMITED 오류에만 retryAfterSeconds를 허용하고 다른 코드에서는 거절한다", () => {
    const rateLimited = toApiV1ErrorResponse({
      code: "RATE_LIMITED",
      requestId,
      retryAfterSeconds: 60,
    });
    expect(rateLimited).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: API_V1_DEFAULT_ERROR_MESSAGES.RATE_LIMITED,
        requestId,
        retryAfterSeconds: 60,
      },
    });

    expect(
      apiV1ErrorResponseSchema.safeParse({
        error: {
          code: "FORBIDDEN",
          message: "권한이 없습니다.",
          requestId,
          retryAfterSeconds: 30,
        },
      }).success,
    ).toBe(false);
  });

  it("내부 진단·SQL·토큰 속성을 오류 응답에서 제거하고 스키마에서도 거절한다", () => {
    const internal = {
      code: "STORAGE_UNAVAILABLE" as const,
      message: "저장소 연결에 실패했습니다.",
      requestId,
      stack: "Error: synthetic stack",
      sql: "SELECT * FROM users",
      blobToken: "vercel_blob_rw_secret",
    };

    const sanitized = toApiV1ErrorResponse(internal);
    expect(sanitized).toEqual({
      error: {
        code: "STORAGE_UNAVAILABLE",
        message: "저장소 연결에 실패했습니다.",
        requestId,
      },
    });
    expect(Object.keys(sanitized.error)).toEqual(["code", "message", "requestId"]);
    expect(apiV1ErrorResponseSchema.safeParse({ error: internal }).success).toBe(false);
  });
});

describe("#272 API v1 시각(UTC wire vs KST 달력 날짜) 및 페이지네이션 계약", () => {
  it("전송 시각은 밀리초 정밀도 UTC ISO 문자열만 허용하고 오프셋·비정규 문자열을 거부한다", () => {
    const now = new Date("2026-10-20T08:30:00.123Z");
    expect(toApiV1Timestamp(now)).toBe("2026-10-20T08:30:00.123Z");
    expect(toApiV1Timestamp("2026-10-20T08:30:00.123Z")).toBe("2026-10-20T08:30:00.123Z");

    for (const invalid of [
      "2026-10-20T17:30:00.123+09:00",
      "2026-10-20T08:30:00Z",
      "2026-10-20 08:30:00.123Z",
      "2026-10-20",
      "2026-02-30T00:00:00.000Z",
    ]) {
      expect(apiV1TimestampSchema.safeParse(invalid).success).toBe(false);
      expect(() => toApiV1Timestamp(invalid)).toThrow();
    }
    expect(() => toApiV1Timestamp(new Date("invalid"))).toThrow();
  });

  it("달력 날짜 스키마는 YYYY-MM-DD 형식만 허용한다", () => {
    expect(apiV1CalendarDateSchema.parse("2026-10-20")).toBe("2026-10-20");
    expect(apiV1CalendarDateSchema.safeParse("2026-10-20T00:00:00.000Z").success).toBe(false);
    expect(apiV1CalendarDateSchema.safeParse("2026/10/20").success).toBe(false);
  });

  it("페이지네이션 질의와 메타데이터를 일관되게 계산하고 경계 밖 입력을 거부한다", () => {
    expect(apiV1PaginationQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: API_V1_DEFAULT_PAGE_SIZE,
      q: undefined,
    });
    expect(apiV1PaginationQuerySchema.parse({ page: "2", pageSize: "20", q: "  공지  " })).toEqual({
      page: 2,
      pageSize: 20,
      q: "공지",
    });
    expect(apiV1PaginationQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(apiV1PaginationQuerySchema.safeParse({ pageSize: API_V1_MAX_PAGE_SIZE + 1 }).success).toBe(false);

    expect(toApiV1PageMeta({ page: 1, pageSize: 10, totalCount: 0 })).toEqual({
      page: 1,
      pageSize: 10,
      totalCount: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });
    expect(toApiV1PageMeta({ page: 2, pageSize: 10, totalCount: 25 })).toEqual({
      page: 2,
      pageSize: 10,
      totalCount: 25,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
    expect(
      apiV1PageMetaSchema.safeParse({
        page: 1,
        pageSize: 10,
        totalCount: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
        extra: true,
      }).success,
    ).toBe(false);
  });
});

describe("#272 API v1 whitelist DTO mapper", () => {
  it("/api/v1/me mapper는 공개 6필드만 남기고 소셜 placeholder 이메일·비밀번호 해시·세션 버전을 제거한다", () => {
    for (const role of USER_ROLES) {
      const mapped = toApiV1MeResponse({
        id: userId,
        name: "홍길동",
        email: "kakao_12345@oauth.placeholder",
        role,
        cohortId,
        image: "https://example.com/avatar.webp",
        passwordHash: "$2a$10$synthetic",
        sessionVersion: 9,
        providerAccountId: "kakao-subject-1",
      } as Parameters<typeof toApiV1MeResponse>[0]);

      expect(mapped).toEqual({
        user: {
          id: userId,
          name: "홍길동",
          email: null,
          role,
          cohortId,
          imageUrl: "https://example.com/avatar.webp",
        },
      });
      expect(apiV1MeResponseSchema.parse(mapped)).toEqual(mapped);
    }

    const withRealEmail = toApiV1MeResponse({
      id: userId,
      name: "김철수",
      email: "member@hra.kr",
      role: "MEMBER",
      cohortId: null,
      image: "   ",
    });
    expect(withRealEmail.user.email).toBe("member@hra.kr");
    expect(withRealEmail.user.imageUrl).toBeNull();
  });

  it("공지 요약 mapper는 작성자 ID·원문 content·status를 제거하고 UTC 시각으로 직렬화한다", () => {
    const rawNotice = {
      id: noticeId,
      title: "2026년 가을 학기 안내",
      excerpt: "가을 학기 일정을 안내합니다.",
      content: "# 전체 마크다운 본문",
      authorId: userId,
      status: "PUBLISHED",
      pinned: true,
      viewCount: 12,
      createdAt: new Date("2026-10-19T01:00:00.000Z"),
      updatedAt: new Date("2026-10-20T02:00:00.000Z"),
    };

    const summary = toApiV1NoticeSummary(rawNotice);
    expect(summary).toEqual({
      id: noticeId,
      title: "2026년 가을 학기 안내",
      excerpt: "가을 학기 일정을 안내합니다.",
      pinned: true,
      viewCount: 12,
      createdAt: "2026-10-19T01:00:00.000Z",
      updatedAt: "2026-10-20T02:00:00.000Z",
    });
    expect(apiV1NoticeSummarySchema.safeParse({ ...summary, authorId: userId }).success).toBe(false);
  });
});
