/**
 * 학사 요청의 개인정보 없는 관측 계약입니다.
 * 요청 참조는 서버가 만들고 actor는 실제 인가 성공 후에만 연결합니다.
 * 도메인 SQL 감사 이력을 대체하지 않으며 원본 오류·입력 객체는 로그에 전달하지 않습니다.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod/v4";
import { logServerError } from "@/lib/errors";

const actionSchema = z.enum([
  "ENROLLMENT_LINK", "STUDENT_REGISTER", "ASSIGNMENT_CREATE", "ASSIGNMENT_UPDATE",
  "ASSIGNMENT_PUBLISH", "ASSIGNMENT_CLOSE", "ASSIGNMENT_LIST", "UPLOAD_INTENT",
  "UPLOAD_TOKEN", "UPLOAD_VERIFY", "UPLOAD_CANCEL", "UPLOAD_RECEIPT", "SUBMISSION_FINALIZE", "FILE_READ", "UPLOAD_CLEANUP", "HEALTH_READ",
]);
const resourceSchema = z.enum(["ENROLLMENT_BATCH", "STUDENT", "ASSIGNMENT", "UPLOAD_INTENT", "SUBMISSION", "SUBMISSION_FILE", "HEALTH"]);
const outcomeSchema = z.enum(["AUTHORIZED", "DENIED", "FAILED", "COMPLETED", "REPLAYED", "STREAM_INTERRUPTED", "RETRY", "EXPIRED", "CANCELLED", "SKIPPED"]);
const failureSchema = z.enum(["AUTHORIZATION", "INPUT", "GATE", "CONFLICT", "STORAGE", "STREAM", "NOT_READY", "UNKNOWN"]);
const sqlStateSchema = z.enum(["22023", "22P02", "23502", "23503", "23505", "23514", "40001", "40P01", "42501", "42P01", "42703", "P0001", "XX000", "HRA01", "HRA02", "HRA03", "HRA04", "HRA05", "HRA06", "HRA07", "HRA08", "HRA09"]);

export type AcademicAction = z.infer<typeof actionSchema>;
export type AcademicResource = z.infer<typeof resourceSchema>;
export type AcademicOutcome = z.infer<typeof outcomeSchema>;
type FailureCode = z.infer<typeof failureSchema>;
type EventDetails = {
  resourceId?: unknown;
  requestId?: unknown;
  failureCode?: FailureCode;
  sqlState?: unknown;
  retryCount?: unknown;
};
type ObservationIds = { resourceId?: unknown; requestId?: unknown };

export interface AcademicObservation {
  readonly correlationId: string;
  readonly authenticatedActorId: string | null;
  readonly failureRecorded: boolean;
  authenticated(userId: string): void;
  identify(ids: ObservationIds): void;
  emit(outcome: AcademicOutcome, details?: EventDetails): boolean;
  fork(action: AcademicAction, resourceType: AcademicResource): AcademicObservation;
}

/** 임의 객체의 getter·Proxy·toJSON을 실행해 원문을 직렬화하지 않습니다. */
function ownValue(input: unknown, key: string): unknown {
  try {
    if (typeof input !== "object" || input === null) return undefined;
    return Object.getOwnPropertyDescriptor(input, key)?.value;
  } catch {
    return undefined;
  }
}

function uuidOrNull(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const parsed = z.uuid().safeParse(input);
  return parsed.success ? parsed.data.toLowerCase() : null;
}

/** 고정 집합의 SQLSTATE만 선택하며 message·detail·params를 읽지 않습니다. */
export function academicSqlState(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 3; depth++) {
    const result = sqlStateSchema.safeParse(ownValue(current, "code"));
    if (result.success) return result.data;
    current = ownValue(current, "cause");
  }
  return undefined;
}

/** 내부 서비스에만 전달하는 요청별 관측기입니다. 클라이언트 입력을 받지 않습니다. */
export function createAcademicObservation(action: AcademicAction, resourceType: AcademicResource) {
  return createObservation(action,resourceType,randomUUID());
}

/** 파생 관측기도 서버에서 생성한 같은 참조만 공유하며 actor·완료 상태는 독립적으로 검증합니다. */
function createObservation(action: AcademicAction, resourceType: AcademicResource, correlationId: string): AcademicObservation {
  let actorUserId: string | null = null;
  let resourceId: string | null = null;
  let requestId: string | null = null;
  let failureRecorded = false;
  return {
    correlationId,
    /** 실제 세션 인증과 대상 인가를 마친 직후에만 호출합니다. */
    authenticated(userId: string) { actorUserId = uuidOrNull(userId); },
    get authenticatedActorId() { return actorUserId; },
    get failureRecorded() { return failureRecorded; },
    fork(childAction: AcademicAction, childResource: AcademicResource) {
      return createObservation(childAction,childResource,correlationId);
    },
    /** 입력 검증 후 참조 ID를 보관하여 이후 실패에도 동일한 ID를 남깁니다. */
    identify(ids: ObservationIds) {
      resourceId = uuidOrNull(ownValue(ids, "resourceId"));
      requestId = uuidOrNull(ownValue(ids, "requestId"));
    },
    emit(outcome: AcademicOutcome, details: EventDetails = {}): boolean {
      const safeAction = actionSchema.safeParse(action);
      const safeResource = resourceSchema.safeParse(resourceType);
      const safeOutcome = outcomeSchema.safeParse(outcome);
      if (!safeAction.success || !safeResource.success || !safeOutcome.success) return false;
      if (["DENIED", "FAILED", "STREAM_INTERRUPTED"].includes(safeOutcome.data)) failureRecorded = true;
      const failure = failureSchema.safeParse(ownValue(details, "failureCode"));
      const state = sqlStateSchema.safeParse(ownValue(details, "sqlState"));
      const retries = z.number().int().min(0).max(1_000_000).safeParse(ownValue(details, "retryCount"));
      // spread나 toJSON 대신 허용된 고정 키만으로 새로운 평탄한 레코드를 만듭니다.
      const event = {
        schemaVersion: 1, action: safeAction.data, resourceType: safeResource.data,
        resourceId: uuidOrNull(ownValue(details, "resourceId")) ?? resourceId,
        requestId: uuidOrNull(ownValue(details, "requestId")) ?? requestId,
        actorUserId, outcome: safeOutcome.data, timestamp: new Date().toISOString(), correlationId,
        failureCode: failure.success ? failure.data : null,
        sqlState: state.success ? state.data : null,
        retryCount: retries.success ? retries.data : null,
      };
      try {
        if (["DENIED", "FAILED", "STREAM_INTERRUPTED"].includes(safeOutcome.data)) {
          logServerError("academic/events", new Error("학사 요청 처리 실패"), event);
        } else {
          console.info("[academic/events]", event);
        }
        return true;
      } catch {
        // 로그 전송 실패가 이미 커밋한 도메인 성공을 실패로 뒤집지 않도록 합니다.
        return false;
      }
    },
  };
}

