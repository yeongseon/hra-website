/**
 * 학생 본인의 과제 목록·상세를 반환하는 서버 전용 진입점이다.
 * 요청마다 실제 인증과 기능 gate를 확인하고 명시 DTO를 구성한다. 사용자 ID를 인수로 받지 않는다.
 */
import "server-only";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { AcademicAccessError, requireAcademicStudent, requireAssignmentTarget, withAcademicQueryErrors } from "@/lib/academic-permissions";
import { buildStudentAssignmentDetailQuery, buildStudentAssignmentListQuery } from "./data";
import type { StudentAssignmentDetail, StudentAssignmentPage, StudentAssignmentSummary } from "./contracts";

// 결과 크기와 최대 OFFSET을 제한한다. 서버 페이지는 문자열 검색 인수를 숫자로 정규화한 뒤 전달한다.
const pagination = z.object({
  page: z.number().int().min(1).max(10000).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
}).strict();

type SummaryRow = Awaited<ReturnType<typeof buildStudentAssignmentListQuery>>[number];

// DB 응답 전체를 펼치지 않고 허용 필드만 선택하여 최소 DTO를 만든다.
function toSummary(row: SummaryRow): StudentAssignmentSummary {
  if (row.status === "DRAFT" || !row.dueAt || !row.publishedAt
    || !Number.isFinite(row.dueAt.getTime()) || !Number.isFinite(row.publishedAt.getTime())
    || (row.submittedAt && !Number.isFinite(row.submittedAt.getTime()))) throw new AcademicAccessError("UNAVAILABLE");
  return {
    assignmentId: row.assignmentId, targetId: row.targetId, title: row.title, status: row.status,
    dueAt: row.dueAt.toISOString(), publishedAt: row.publishedAt.toISOString(),
    submission: row.submittedAt ? { submittedAt: row.submittedAt.toISOString() } : null,
  };
}

export async function getMyAssignments(input: unknown = {}): Promise<StudentAssignmentPage> {
  const { userId } = await requireAcademicStudent();
  const parsed = pagination.safeParse(input);
  if (!parsed.success) throw new AcademicAccessError("INVALID_INPUT");
  const { page, pageSize } = parsed.data;
  const rows = await withAcademicQueryErrors(() => buildStudentAssignmentListQuery(db, userId, page, pageSize));
  return { items: rows.slice(0, pageSize).map(toSummary), page, pageSize, hasNextPage: rows.length > pageSize };
}

// 상세 UUID가 유효해도 본인 target과 유효 학적·공개 상태가 모두 일치해야 한다.
export async function getMyAssignment(assignmentId: string): Promise<StudentAssignmentDetail> {
  const target = await requireAssignmentTarget({ assignmentId });
  const [row] = await withAcademicQueryErrors(() => buildStudentAssignmentDetailQuery(db, target.userId, target.targetId));
  if (!row) throw new AcademicAccessError("NOT_FOUND");
  // DB 최종 기록의 파일 메타가 빠진 상태를 정상 제출 완료로 표시하지 않는다.
  if (row.submittedAt && (!row.fileId || !row.originalName || row.mimeType !== "application/pdf"
    || row.sizeBytes === null || row.sizeBytes < 1 || row.sizeBytes > 52428800)) throw new AcademicAccessError("UNAVAILABLE");
  const file = row.submittedAt && row.fileId && row.originalName && row.mimeType && row.sizeBytes !== null
    ? { fileId: row.fileId, originalName: row.originalName, mimeType: row.mimeType, sizeBytes: row.sizeBytes } : null;
  return { ...toSummary(row), instructions: row.instructions, file };
}
