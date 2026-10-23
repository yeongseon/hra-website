/**
 * 모바일·Web 공용 공개 공지 목록 API v1 연결 계층입니다.
 * URL 입력을 엄격히 검증하고 공지 서비스의 결과를 whitelist DTO로 직렬화합니다.
 * DB 조회·게시 정책·Markdown 발췌는 서비스/저장소에 맡깁니다.
 */
import {
  apiV1NoticeListResponseSchema,
  apiV1PaginationQuerySchema,
  getApiV1ErrorHttpStatus,
  toApiV1ErrorResponse,
  toApiV1NoticeSummary,
  toApiV1PageMeta,
} from "@hra/contracts/api-v1";
import { listPublishedNoticesForApi } from "@/features/notices/public-list/service";
import { logServerError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const allowedQueryKeys = new Set(["page", "pageSize", "q"]);
const responseHeaders = { "Cache-Control": "no-store" };

/** 중복·미등록 키가 객체 변환 과정에서 사라지기 전에 거부합니다. */
function parseQuery(request: Request) {
  const values: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (!allowedQueryKeys.has(key) || Object.hasOwn(values, key)) return null;
    values[key] = value;
  }
  const parsed = apiV1PaginationQuerySchema.safeParse(values);
  if (!parsed.success) return null;

  // SQL OFFSET 정수 범위를 넘어가는 값도 DB 접근 전에 입력 오류로 처리합니다.
  const offset = (parsed.data.page - 1) * parsed.data.pageSize;
  return Number.isSafeInteger(offset) ? parsed.data : null;
}

/** 사용자 오류에는 고정 코드·한국어 문구·추적 ID만 포함합니다. */
function errorResponse(code: "INVALID_INPUT" | "UNAVAILABLE", requestId: string) {
  return Response.json(toApiV1ErrorResponse({ code, requestId }), {
    status: getApiV1ErrorHttpStatus(code),
    headers: responseHeaders,
  });
}

/** 공개 목록만 제공하고 초안·본문·작성자 ID는 응답에 싣지 않습니다. */
export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const input = parseQuery(request);
    if (!input) return errorResponse("INVALID_INPUT", requestId);

    const result = await listPublishedNoticesForApi({
      query: input.q ?? "",
      page: input.page,
      pageSize: input.pageSize,
    });
    const body = apiV1NoticeListResponseSchema.parse({
      notices: result.items.map(toApiV1NoticeSummary),
      page: toApiV1PageMeta({
        page: input.page,
        pageSize: input.pageSize,
        totalCount: result.totalCount,
      }),
    });
    return Response.json(body, { headers: responseHeaders });
  } catch (error) {
    // SQL·검색어·원본 오류는 응답과 추가 로그 문맥에 반사하지 않습니다.
    logServerError("api-v1/notices", error, { requestId });
    return errorResponse("UNAVAILABLE", requestId);
  }
}
