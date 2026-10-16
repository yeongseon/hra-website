/** 업로드 실패를 고정 분류로만 기록합니다. 원본 오류는 logger 입력으로 전달하지 않습니다. */
import "server-only";
import { academicSqlState, type AcademicObservation } from "@/lib/academic-observability";

export function recordUploadFailure(observation: AcademicObservation, error: unknown) {
  if (observation.failureRecorded) return;
  // cron 정리 모듈에 세션·DB 인가 구현을 끌어오지 않고 고정 거부 코드만 읽습니다.
  let denied = false;
  let code: unknown;
  try {
    code = typeof error === "object" && error !== null ? Object.getOwnPropertyDescriptor(error, "code")?.value : undefined;
    denied = typeof code === "string" && ["UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND"].includes(code);
  } catch {
    denied = false;
  }
  const failureCode = denied ? "AUTHORIZATION" as const
    : code === "INVALID_FILE" || code === "INVALID_INPUT" ? "INPUT" as const
      : code === "DISABLED" ? "GATE" as const
        : typeof code === "string" && ["CONFLICT", "EXPIRED", "RATE_LIMITED"].includes(code) ? "CONFLICT" as const
          : code === "NOT_READY" ? "NOT_READY" as const : "STORAGE" as const;
  observation.emit(denied ? "DENIED" : "FAILED", { failureCode, sqlState: academicSqlState(error) });
}

/** 서비스 직접 호출과 HTTP 경계가 같은 관측기를 사용할 수 있도록 실패 기록을 멱등화합니다. */
export async function observeUpload<T>(observation: AcademicObservation, run: () => Promise<T>, complete = true): Promise<T> {
  try {
    const result = await run();
    if (complete) observation.emit("COMPLETED");
    return result;
  } catch (error) {
    recordUploadFailure(observation, error);
    throw error;
  }
}
