/**
 * 모바일·Web 공용 공개 공지 상세 API v1 연결 계층입니다.
 * 경로 입력과 응답 형식을 검증하고 공개 게시 정책·조회수 갱신은 서비스에 맡깁니다.
 */
import { after } from "next/server";
import {
  apiV1UuidSchema,
  getApiV1ErrorHttpStatus,
  toApiV1ErrorResponse,
  toApiV1NoticeDetailResponse,
} from "@hra/contracts/api-v1";
import { getPublishedNoticeById, incrementPublishedNoticeViewCount } from "@/features/notices/detail/service";
import { logServerError } from "@/lib/errors";

export const dynamic = "force-dynamic";

type NoticeRouteContext = { params: Promise<{ id: string }> };
const responseHeaders = { "Cache-Control": "no-store" };

/** 공개 오류에는 고정 코드·한국어 문구·추적 ID만 포함합니다. */
function errorResponse(code: "INVALID_INPUT" | "NOT_FOUND" | "UNAVAILABLE", requestId: string) {
  return Response.json(toApiV1ErrorResponse({ code, requestId }), {
    status: getApiV1ErrorHttpStatus(code),
    headers: responseHeaders,
  });
}

/** 공개 공지만 반환하고 응답 완료 뒤 조회수를 원자적으로 증가시킵니다. */
export async function GET(request: Request, { params }: NoticeRouteContext): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    // 지원하지 않는 query와 잘못된 UUID는 저장소를 열기 전에 거부합니다.
    if (new URL(request.url).searchParams.size > 0) return errorResponse("INVALID_INPUT", requestId);
    const parsedId = apiV1UuidSchema.safeParse((await params).id);
    if (!parsedId.success) return errorResponse("INVALID_INPUT", requestId);

    const notice = await getPublishedNoticeById(parsedId.data);
    if (!notice) return errorResponse("NOT_FOUND", requestId);

    const body = toApiV1NoticeDetailResponse(notice);
    // after는 Route Handler에서도 응답 뒤 콜백의 Promise 완료를 기다립니다.
    after(async () => {
      try {
        await incrementPublishedNoticeViewCount(notice.id);
      } catch (error) {
        logServerError("api-v1/notices/detail/viewCount", error, { requestId });
      }
    });
    return Response.json(body, { headers: responseHeaders });
  } catch (error) {
    // DB·SQL 원문이나 경로 입력을 공개 응답·추가 로그 문맥에 남기지 않습니다.
    logServerError("api-v1/notices/detail", error, { requestId });
    return errorResponse("UNAVAILABLE", requestId);
  }
}
