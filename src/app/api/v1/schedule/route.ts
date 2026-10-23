/**
 * 공개 한국 달력 일정의 API v1 연결 계층입니다.
 * Web과 달리 연·월을 필수로 검증하고, 저장소의 벽시계 값을 실제 UTC 순간으로 주장하지 않습니다.
 */
import {
  apiV1ScheduleQuerySchema,
  apiV1ScheduleResponseSchema,
  getApiV1ErrorHttpStatus,
  toApiV1ErrorResponse,
} from "@hra/contracts/api-v1";
import { listPublicScheduleApiMonth } from "@/features/schedule/public/service";
import { logServerError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const allowedQueryKeys = new Set(["year", "month"]);
const responseHeaders = { "Cache-Control": "no-store" };

/** 중복·미등록 입력은 객체 변환 시 사라지기 전에 거부합니다. */
function parseQuery(request: Request) {
  const values: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (!allowedQueryKeys.has(key) || Object.hasOwn(values, key)) return null;
    values[key] = value;
  }
  const parsed = apiV1ScheduleQuerySchema.safeParse(values);
  return parsed.success ? parsed.data : null;
}

/** 오류 원문·URL·SQL 없이 고정 코드와 추적 ID만 반환합니다. */
function errorResponse(code: "INVALID_INPUT" | "UNAVAILABLE", requestId: string) {
  return Response.json(toApiV1ErrorResponse({ code, requestId }), {
    status: getApiV1ErrorHttpStatus(code),
    headers: responseHeaders,
  });
}

/** 공개 일정만 조회하고 한국 달력 날짜·벽시계 시각으로 직렬화합니다. */
export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const query = parseQuery(request);
    if (!query) return errorResponse("INVALID_INPUT", requestId);

    const result = await listPublicScheduleApiMonth(query.year, query.month);
    return Response.json(apiV1ScheduleResponseSchema.parse(result), { headers: responseHeaders });
  } catch (error) {
    // 내부 SQL·일정 설명·입력 URL을 추가 로그 문맥과 HTTP 오류에 반사하지 않습니다.
    logServerError("api-v1/schedule", error, { requestId });
    return errorResponse("UNAVAILABLE", requestId);
  }
}
