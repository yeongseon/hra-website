/** 지정된 학사 승인자만 현재 필터에 맞는 대상 전원의 최소 CSV를 내려받는 API다. */
import { exportAssignmentSubmissionStatuses } from "@/features/academics/submission-statuses/queries";
import { SubmissionStatusError, submissionStatusRequestInput } from "@/features/academics/submission-statuses/contracts";
import { renderSubmissionStatusesCsv, submissionCsvDisposition } from "@/features/academics/submission-statuses/csv";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const { id } = await params;
    const result = await exportAssignmentSubmissionStatuses(submissionStatusRequestInput(id, new URL(request.url).searchParams));
    return new Response(renderSubmissionStatusesCsv(result.rows), { headers: { ...headers,
      "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": submissionCsvDisposition(result.assignment.title) } });
  } catch (error) {
    const safe = error instanceof SubmissionStatusError ? error : new SubmissionStatusError("UNAVAILABLE");
    return Response.json({ message: safe.message }, { status: safe.status, headers });
  }
}
