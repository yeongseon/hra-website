// @vitest-environment node
/**
 * 학사 MVP의 전송 DTO·본문 경계와 비공개 저장소 정보 배제를 검증합니다.
 * DB 모델에 새 열이 생겨도 API에 자동 노출되지 않도록 엄격한 허용 목록을 유지합니다.
 */
import { describe, expect, it } from "vitest";
import {
  apiV1AssignmentDetailResponseSchema,
  apiV1AssignmentListQuerySchema,
  apiV1AssignmentListResponseSchema,
  apiV1AssignmentSubmissionResponseSchema,
  apiV1AssignmentSummarySchema,
  apiV1FinalizeSubmissionInputSchema,
  apiV1FinalizedSubmissionResponseSchema,
  apiV1SubmissionFileMetadataSchema,
  apiV1UploadCancelledResponseSchema,
  apiV1UploadIntentInputSchema,
  apiV1UploadIntentResponseSchema,
  apiV1UploadSelectionInputSchema,
  apiV1UploadVerifiedResponseSchema,
} from "@hra/contracts/api-v1";

const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const timestamp = "2026-10-28T00:00:00.000Z";
const file = { fileId: id, originalName: "합성 과제.PDF", mimeType: "application/pdf", sizeBytes: 5 };
const summary = {
  assignmentId: id, targetId: id, title: "합성 과제", status: "PUBLISHED",
  dueAt: timestamp, publishedAt: timestamp, submission: null,
};
const intent = { assignmentId: id, requestId: id, originalName: "합성 과제.PDF", sizeBytes: 5, mimeType: "application/pdf" };

describe("학사 API v1의 본인 과제·제출 전송 계약", () => {
  it("기존 학생 조회의 기본값·페이지 상한과 허용 query를 유지한다", () => {
    expect(apiV1AssignmentListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(apiV1AssignmentListQuerySchema.parse({ page: "10000", pageSize: "50" })).toEqual({ page: 10000, pageSize: 50 });
    for (const input of [{ page: 0 }, { page: 10001 }, { pageSize: 51 }, { page: 1.2 }, { userId: id }, { q: "검색" }]) {
      expect(apiV1AssignmentListQuerySchema.safeParse(input).success).toBe(false);
    }
  });

  it("공개·마감된 본인 과제만 허용하고 UTC wire 시각을 고정한다", () => {
    expect(apiV1AssignmentSummarySchema.parse(summary)).toEqual(summary);
    expect(apiV1AssignmentSummarySchema.parse({ ...summary, status: "CLOSED" }).status).toBe("CLOSED");
    for (const change of [
      { status: "DRAFT" }, { dueAt: "2026-10-28T09:00:00.000+09:00" },
      { publishedAt: "2026-10-28T00:00:00Z" }, { dueAt: "2026-02-30T00:00:00.000Z" },
      { studentId: id }, { userId: id }, { cohortEnrollmentId: id }, { storageKey: "private/hidden" },
    ]) expect(apiV1AssignmentSummarySchema.safeParse({ ...summary, ...change }).success).toBe(false);
  });

  it("다음 페이지 여부만 제공하고 저장소에서 조회하지 않은 totalCount를 수용하지 않는다", () => {
    const response = { assignments: [summary], page: { page: 1, pageSize: 20, hasNextPage: true } };
    expect(apiV1AssignmentListResponseSchema.parse(response)).toEqual(response);
    expect(apiV1AssignmentListResponseSchema.parse({ assignments: [], page: { ...response.page, page: 9999, hasNextPage: false } }).page.page).toBe(9999);
    expect(apiV1AssignmentListResponseSchema.safeParse({ ...response, page: { ...response.page, totalCount: 1 } }).success).toBe(false);
    expect(apiV1AssignmentListResponseSchema.safeParse({ ...response, assignments: Array.from({ length: 51 }, () => summary) }).success).toBe(false);
  });

  it("미제출과 최종 PDF 메타를 표현하며 파일 URL·토큰·저장키는 어느 DTO에도 받지 않는다", () => {
    const detail = { assignment: { ...summary, instructions: "안내", file: null } };
    expect(apiV1AssignmentDetailResponseSchema.parse(detail)).toEqual(detail);
    expect(apiV1AssignmentSubmissionResponseSchema.parse({ submission: null, file: null })).toEqual({ submission: null, file: null });
    const submitted = { submission: { submissionId: id, submittedAt: timestamp }, file };
    expect(apiV1AssignmentSubmissionResponseSchema.parse(submitted)).toEqual(submitted);
    for (const extra of [{ fileUrl: "https://example.test/private" }, { token: "synthetic-secret" }, { storageKey: "private/hidden" }]) {
      expect(apiV1SubmissionFileMetadataSchema.safeParse({ ...file, ...extra }).success).toBe(false);
      expect(apiV1AssignmentDetailResponseSchema.safeParse({ assignment: { ...summary, instructions: "안내", file: { ...file, ...extra } } }).success).toBe(false);
      expect(apiV1AssignmentSubmissionResponseSchema.safeParse({ ...submitted, ...extra }).success).toBe(false);
    }
  });

  it("제출 입력은 식별자 세 개만 받고 재시도 여부와 최종 메타만 반환한다", () => {
    const input = { assignmentId: id, uploadIntentId: id, submissionKey: id };
    expect(apiV1FinalizeSubmissionInputSchema.parse(input)).toEqual(input);
    for (const extra of [{ userId: id }, { pathname: "private/path" }, { checksum: "untrusted" }]) {
      expect(apiV1FinalizeSubmissionInputSchema.safeParse({ ...input, ...extra }).success).toBe(false);
    }
    for (const replayed of [false, true]) {
      const response = { submission: { assignmentId: id, submissionId: id, submittedAt: timestamp, replayed, file } };
      expect(apiV1FinalizedSubmissionResponseSchema.parse(response)).toEqual(response);
      expect(apiV1FinalizedSubmissionResponseSchema.safeParse({ ...response, sql: "synthetic" }).success).toBe(false);
      expect(apiV1FinalizedSubmissionResponseSchema.safeParse({ submission: { ...response.submission, submittedAt: "2026-10-28T09:00:00.000+09:00" } }).success).toBe(false);
    }
  });
});

describe("학사 API v1의 PDF 업로드 전송 계약", () => {
  it("안전한 PDF 이름·정확 MIME·빈 파일 제외·50MiB 상한을 적용한다", () => {
    expect(apiV1UploadIntentInputSchema.parse({ ...intent, originalName: "  과제.PDF  " })).toEqual({ ...intent, originalName: "과제.PDF" });
    expect(apiV1UploadIntentInputSchema.parse({ ...intent, sizeBytes: 52_428_800 }).sizeBytes).toBe(52_428_800);
    for (const change of [
      { sizeBytes: 0 }, { sizeBytes: 52_428_801 }, { sizeBytes: 1.5 },
      { mimeType: "application/octet-stream" }, { originalName: "안내.docx" },
      { originalName: "../과제.pdf" }, { originalName: "경로\\과제.pdf" },
      { originalName: "과\u0000제.pdf" }, { originalName: "a".repeat(252) + ".pdf" },
      { userId: id }, { fileUrl: "https://example.test/private" },
    ]) expect(apiV1UploadIntentInputSchema.safeParse({ ...intent, ...change }).success).toBe(false);
  });

  it("발급 결과의 불투명 경로가 발급 ID와 일치하고 공개 URL·임의 경로를 거부한다", () => {
    const response = { uploadIntentId: id, pathname: `academic-uploads/v1/${id}/document.pdf`, expiresAt: timestamp };
    expect(apiV1UploadIntentResponseSchema.parse(response)).toEqual(response);
    for (const change of [
      { pathname: `academic-uploads/v1/${otherId}/document.pdf` },
      { pathname: `https://example.test/${response.pathname}` },
      { pathname: `academic-uploads/v1/${id}/../document.pdf` },
      { pathname: `academic-uploads/v1/${id}/original.pdf` },
      { token: "synthetic-secret" },
    ]) expect(apiV1UploadIntentResponseSchema.safeParse({ ...response, ...change }).success).toBe(false);
  });

  it("검증·취소의 JSON은 과제 ID만 받아 경로 ID·사용자 값을 본문으로 재정의하지 않는다", () => {
    expect(apiV1UploadSelectionInputSchema.parse({ assignmentId: id })).toEqual({ assignmentId: id });
    expect(apiV1UploadSelectionInputSchema.safeParse({ assignmentId: id, uploadIntentId: otherId }).success).toBe(false);
    expect(apiV1UploadSelectionInputSchema.safeParse({ assignmentId: id, role: "ADMIN" }).success).toBe(false);
    expect(apiV1UploadVerifiedResponseSchema.parse({ state: "VERIFIED" })).toEqual({ state: "VERIFIED" });
    expect(apiV1UploadCancelledResponseSchema.parse({ state: "CANCELLED" })).toEqual({ state: "CANCELLED" });
    expect(apiV1UploadVerifiedResponseSchema.safeParse({ state: "SUBMITTED" }).success).toBe(false);
    expect(apiV1UploadCancelledResponseSchema.safeParse({ state: "CANCELLED", deleted: true }).success).toBe(false);
  });
});
