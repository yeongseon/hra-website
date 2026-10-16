/** 지정된 학사 승인자의 현황·내보내기 조회 진입점이다. 요청마다 인증과 기능 gate를 DB 전에 확인한다. */
import "server-only";
import { db } from "@/lib/db";
import { getAcademicApproverId, requireAcademicApprover } from "@/lib/academic-admin";
import { SubmissionStatusError, submissionStatusInput, submissionStatusSnapshot } from "./contracts";
import { buildSubmissionStatusesQuery, SUBMISSION_STATUS_EXPORT_LIMIT } from "./data";

async function authorize() {
  let actorId: string; let configuredId: string;
  try { actorId = await requireAcademicApprover(); configuredId = getAcademicApproverId(); }
  catch { throw new SubmissionStatusError("FORBIDDEN"); }
  if (actorId !== configuredId) throw new SubmissionStatusError("FORBIDDEN");
  if (process.env.ACADEMIC_ENABLED !== "true") throw new SubmissionStatusError("NOT_FOUND");
  return { actorId, configuredId };
}

async function load(input: unknown, exportAll: boolean) {
  const authorization = await authorize();
  const parsed = submissionStatusInput.safeParse(input);
  if (!parsed.success) throw new SubmissionStatusError("INVALID_INPUT");
  try {
    const result = await db.execute(buildSubmissionStatusesQuery(parsed.data, authorization, exportAll));
    const raw = result.rows[0];
    // 인증 뒤 역할 철회도 SQL과 같은 snapshot에서 판단하며 빈 성공 응답으로 바꾸지 않는다.
    if (raw?.authorized !== true) throw new SubmissionStatusError("FORBIDDEN");
    if (!raw.assignment) throw new SubmissionStatusError("NOT_FOUND");
    const snapshot = submissionStatusSnapshot.parse(raw);
    if (snapshot.counts.total !== snapshot.counts.submitted + snapshot.counts.unsubmitted) throw new SubmissionStatusError("UNAVAILABLE");
    if (exportAll && snapshot.filteredCount > SUBMISSION_STATUS_EXPORT_LIMIT) throw new SubmissionStatusError("TOO_MANY_ROWS");
    return { ...snapshot, page: parsed.data.page, pageSize: parsed.data.pageSize };
  } catch (error) {
    if (error instanceof SubmissionStatusError) throw error;
    throw new SubmissionStatusError("UNAVAILABLE");
  }
}

export async function listAssignmentSubmissionStatuses(input: unknown) { return load(input, false); }
export async function exportAssignmentSubmissionStatuses(input: unknown) { return load(input, true); }
