/** 학사 승인자 전용 운영 집계 API입니다. 실패 응답은 고정 한국어 안내와 서버 요청 참조만 포함합니다. */
import { AcademicHealthError, getAcademicHealth } from "@/lib/academic-health";
import { academicSqlState, createAcademicObservation } from "@/lib/academic-observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const observation = createAcademicObservation("HEALTH_READ", "HEALTH");
  const headers = { "Cache-Control": "no-store", "X-Request-Id": observation.correlationId };
  try {
    const health = await getAcademicHealth(observation);
    observation.emit("COMPLETED");
    return Response.json({ ...health, referenceId: observation.correlationId }, { headers });
  } catch (error) {
    const status = error instanceof AcademicHealthError ? error.status : 503;
    observation.emit(status === 403 ? "DENIED" : "FAILED", {
      failureCode: status === 403 ? "AUTHORIZATION" : "NOT_READY", sqlState: academicSqlState(error),
    });
    return Response.json({ message: status === 403 ? "학사 운영 책임자만 확인할 수 있습니다." : "학사 운영 상태 조회를 준비 중입니다.",
      referenceId: observation.correlationId }, { status, headers });
  }
}
