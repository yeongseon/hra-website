/**
 * #272 공용 API v1의 공통 오류·페이지네이션·시각(UTC wire vs KST 날짜)·핵심 MVP whitelist DTO 계약입니다.
 *
 * 역할:
 * - Web·Android·iOS 클라이언트가 공유할 기계 판독 가능한 오류 코드와 HTTP 상태 매핑을 고정합니다.
 * - DB row를 직접 반환하지 않고 허용된 공개 필드만 선택하는 whitelist DTO mapper를 제공합니다.
 * - 전송 시각(UTC 밀리초 ISO 문자열)과 한국 시각 기준 달력 날짜(YYYY-MM-DD)를 분리합니다.
 * - Web 앱의 물리 경로 이동(#271) 전에도 서버·클라이언트·계약 테스트가 이 패키지를 정본으로 참조합니다.
 */
import { z } from "zod/v4";
import { getDisplayEmail, USER_ROLES, type UserRole } from "./identity";

/**
 * #272 최소 MVP API의 8개 도메인 경계입니다.
 */
export const API_V1_MVP_DOMAINS = [
  "me",
  "notices",
  "schedule",
  "resources",
  "assignments",
  "submissions",
  "upload",
  "download",
] as const;
export type ApiV1MvpDomain = (typeof API_V1_MVP_DOMAINS)[number];

/**
 * #272 공통 오류 코드 목록입니다.
 * 인증·인가 실패, 입력 검증, 요청 한도 초과, 기능 비활성화, 상태/동시성 충돌, 스토리지 실패를 모두 포함합니다.
 */
export const API_V1_ERROR_CODES = [
  "DISABLED",
  "INVALID_INPUT",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "TOO_LARGE",
  "RATE_LIMITED",
  "STORAGE_UNAVAILABLE",
  "UNAVAILABLE",
] as const;
export type ApiV1ErrorCode = (typeof API_V1_ERROR_CODES)[number];

/**
 * 오류 코드별 고정 HTTP 상태 코드 매핑입니다.
 */
export const API_V1_ERROR_STATUS_BY_CODE = {
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
} as const satisfies Record<ApiV1ErrorCode, number>;

/**
 * 사용자에게 안전하게 노출할 수 있는 기본 한국어 오류 안내 문구입니다.
 */
export const API_V1_DEFAULT_ERROR_MESSAGES = {
  DISABLED: "현재 사용할 수 없는 기능입니다.",
  INVALID_INPUT: "요청 입력값이 올바르지 않습니다.",
  UNAUTHENTICATED: "로그인이 필요합니다.",
  FORBIDDEN: "요청한 작업에 대한 권한이 없습니다.",
  NOT_FOUND: "요청한 대상을 찾을 수 없습니다.",
  CONFLICT: "다른 변경과 충돌했습니다. 최신 상태를 확인한 뒤 다시 시도해 주세요.",
  TOO_LARGE: "허용된 요청 크기를 초과했습니다.",
  RATE_LIMITED: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  STORAGE_UNAVAILABLE: "파일 저장소 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  UNAVAILABLE: "요청을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.",
} as const satisfies Record<ApiV1ErrorCode, string>;

/**
 * 표준 UUID 식별자 스키마입니다. 줄바꿈·공백 접미사를 허용하지 않습니다.
 */
export const apiV1UuidSchema = z
  .string()
  .length(36)
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

/**
 * 전송 시각(wire timestamp)은 항상 UTC 밀리초 정밀도 ISO-8601(`YYYY-MM-DDTHH:mm:ss.sssZ`)로 고정합니다.
 * KST(+09:00) 표시 변환은 UI 계층에서만 수행합니다.
 */
export const apiV1TimestampSchema = z.iso.datetime({ precision: 3 }).refine((value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
});

/**
 * 한국 시각 기준 수업일·일정일 등 시차로 날짜가 밀리면 안 되는 달력 날짜(`YYYY-MM-DD`) 스키마입니다.
 */
export const apiV1CalendarDateSchema = z.iso.date();

/**
 * Date 객체 또는 정규 UTC ISO 문자열을 API v1 wire timestamp 문자열로 변환합니다.
 */
export function toApiV1Timestamp(value: Date | string): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      throw new TypeError("유효하지 않은 Date 객체입니다.");
    }
    return value.toISOString();
  }
  return apiV1TimestampSchema.parse(value);
}

/**
 * 공통 오류 응답 스키마입니다 (`{ error: { code, message, requestId, retryAfterSeconds? } }`).
 * retryAfterSeconds는 RATE_LIMITED 응답에서만 선택적으로 허용합니다.
 */
export const apiV1ErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.enum(API_V1_ERROR_CODES),
        message: z.string().min(1),
        requestId: apiV1UuidSchema,
        retryAfterSeconds: z.number().int().min(1).max(86_400).optional(),
      })
      .strict()
      .refine(
        (error) => error.retryAfterSeconds === undefined || error.code === "RATE_LIMITED",
        "retryAfterSeconds는 RATE_LIMITED 오류에서만 설정할 수 있습니다.",
      ),
  })
  .strict();
export type ApiV1ErrorResponse = z.infer<typeof apiV1ErrorResponseSchema>;

/**
 * 오류 코드에 대응하는 HTTP 상태 코드를 반환합니다.
 */
export function getApiV1ErrorHttpStatus(code: ApiV1ErrorCode): number {
  return API_V1_ERROR_STATUS_BY_CODE[code];
}

/**
 * 내부 예외 속성(stack, sql, cause, token 등)을 제거하고 공개 계약 필드만 선택해 오류 응답을 구성합니다.
 */
export function toApiV1ErrorResponse(input: {
  code: ApiV1ErrorCode;
  message?: string;
  requestId: string;
  retryAfterSeconds?: number;
}): ApiV1ErrorResponse {
  const code = input.code;
  const message =
    typeof input.message === "string" && input.message.trim().length > 0
      ? input.message
      : API_V1_DEFAULT_ERROR_MESSAGES[code];
  const error: ApiV1ErrorResponse["error"] =
    code === "RATE_LIMITED" && input.retryAfterSeconds !== undefined
      ? {
          code,
          message,
          requestId: input.requestId,
          retryAfterSeconds: input.retryAfterSeconds,
        }
      : {
          code,
          message,
          requestId: input.requestId,
        };
  return apiV1ErrorResponseSchema.parse({ error });
}

export const API_V1_DEFAULT_PAGE_SIZE = 10;
export const API_V1_MAX_PAGE_SIZE = 50;

/**
 * 목록 API의 공통 페이지네이션·검색 질의 스키마입니다.
 */
export const apiV1PaginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(API_V1_MAX_PAGE_SIZE).default(API_V1_DEFAULT_PAGE_SIZE),
    q: z
      .string()
      .trim()
      .max(100)
      .optional()
      .transform((value) => (value && value.length > 0 ? value : undefined)),
  })
  .strict();
export type ApiV1PaginationQuery = z.infer<typeof apiV1PaginationQuerySchema>;

/**
 * 목록 API 응답의 공통 페이지네이션 메타데이터 스키마입니다.
 */
export const apiV1PageMetaSchema = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(API_V1_MAX_PAGE_SIZE),
    totalCount: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  })
  .strict();
export type ApiV1PageMeta = z.infer<typeof apiV1PageMetaSchema>;

/**
 * page, pageSize, totalCount로부터 일관된 페이지네이션 메타데이터를 계산합니다.
 */
export function toApiV1PageMeta(input: {
  page: number;
  pageSize: number;
  totalCount: number;
}): ApiV1PageMeta {
  const page = Math.trunc(input.page);
  const pageSize = Math.trunc(input.pageSize);
  const totalCount = Math.trunc(input.totalCount);
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);
  return apiV1PageMetaSchema.parse({
    page,
    pageSize,
    totalCount,
    totalPages,
    hasNextPage: totalPages > 0 && page < totalPages,
    hasPreviousPage: totalPages > 0 && page > 1,
  });
}

/**
 * `/api/v1/me` 응답의 사용자 프로필 DTO 스키마입니다.
 * 비밀번호 해시·OAuth provider 식별자·내부 소셜 대체 이메일(@oauth.placeholder)·세션 버전은 제외합니다.
 */
export const apiV1MeResponseSchema = z
  .object({
    user: z
      .object({
        id: apiV1UuidSchema,
        name: z.string().min(1).nullable(),
        email: z.string().min(1).nullable(),
        role: z.enum(USER_ROLES),
        cohortId: apiV1UuidSchema.nullable(),
        imageUrl: z.string().min(1).nullable(),
      })
      .strict(),
  })
  .strict();
export type ApiV1MeResponse = z.infer<typeof apiV1MeResponseSchema>;

/**
 * DB 사용자 행이나 세션 객체에서 `/api/v1/me` 공개 DTO 필드만 안전하게 추출합니다.
 */
export function toApiV1MeResponse(input: {
  id: string;
  name?: string | null;
  email?: string | null;
  role: UserRole;
  cohortId?: string | null;
  image?: string | null;
  imageUrl?: string | null;
}): ApiV1MeResponse {
  const rawImage = input.imageUrl ?? input.image ?? null;
  return apiV1MeResponseSchema.parse({
    user: {
      id: input.id,
      name: typeof input.name === "string" && input.name.trim().length > 0 ? input.name : null,
      email: getDisplayEmail(input.email),
      role: input.role,
      cohortId: input.cohortId ?? null,
      imageUrl: typeof rawImage === "string" && rawImage.trim().length > 0 ? rawImage : null,
    },
  });
}

/**
 * 공개 공지사항 목록 항목의 API v1 whitelist DTO 스키마입니다.
 * 내부 작성자 ID(`authorId`)나 초안 상태 행은 공개 목록 DTO에 포함하지 않습니다.
 */
export const apiV1NoticeSummarySchema = z
  .object({
    id: apiV1UuidSchema,
    title: z.string().min(1),
    excerpt: z.string(),
    pinned: z.boolean(),
    viewCount: z.number().int().nonnegative(),
    createdAt: apiV1TimestampSchema,
    updatedAt: apiV1TimestampSchema,
  })
  .strict();
export type ApiV1NoticeSummary = z.infer<typeof apiV1NoticeSummarySchema>;

/**
 * 공개 공지 목록 GET 응답은 허용된 DTO 배열과 공통 페이지 정보만 전달합니다.
 * 요청한 페이지가 전체 범위를 넘으면 빈 배열과 요청 페이지 번호를 반환합니다.
 */
export const apiV1NoticeListResponseSchema = z
  .object({
    notices: z.array(apiV1NoticeSummarySchema).max(API_V1_MAX_PAGE_SIZE),
    page: apiV1PageMetaSchema,
  })
  .strict();
export type ApiV1NoticeListResponse = z.infer<typeof apiV1NoticeListResponseSchema>;

/**
 * 공지사항 행과 발췌 문자열에서 공개 목록 DTO 필드만 선택합니다.
 */
export function toApiV1NoticeSummary(input: {
  id: string;
  title: string;
  excerpt: string;
  pinned: boolean;
  viewCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}): ApiV1NoticeSummary {
  return apiV1NoticeSummarySchema.parse({
    id: input.id,
    title: input.title,
    excerpt: input.excerpt,
    pinned: input.pinned,
    viewCount: input.viewCount,
    createdAt: toApiV1Timestamp(input.createdAt),
    updatedAt: toApiV1Timestamp(input.updatedAt),
  });
}
