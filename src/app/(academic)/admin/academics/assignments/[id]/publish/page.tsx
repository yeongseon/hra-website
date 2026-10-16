/** 공개 전 확인 화면. 서버가 계산한 초안 버전·대상 요약을 공개 액션에 전달해 경합 시 전체 롤백한다. */
import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { getAssignmentAdmin, getAssignmentAdminAvailability, getAssignmentPublishPreview } from "@/features/academics/assignments/admin-queries";
import { formatAssignmentKst, assignmentStatusLabels } from "@/features/academics/assignments/admin-display";
import { AssignmentPreparation } from "../../_components/assignment-preparation";
import { AssignmentTransitionForm } from "../../_components/assignment-transition-form";

export const metadata: Metadata = { title: "과제 공개 대상 확인" };
export const dynamic = "force-dynamic";

export default async function PublishAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  if (!await getAssignmentAdminAvailability()) return <AssignmentPreparation />;
  const { id } = await params;
  const record = await getAssignmentAdmin(id);
  if (!record) notFound();
  const { assignment, targetCount } = record.result;
  if (assignment.status !== "DRAFT") return <div className="space-y-4">
    <h1 className="text-3xl font-bold">과제 공개 결과</h1>
    <p>현재 상태: {assignmentStatusLabels[assignment.status]} · 확정 대상 {targetCount}명</p>
    <p>공개 대상을 다시 생성하지 않습니다.</p>
    <Link href={`/admin/academics/assignments/${id}`} className="text-[#2563EB] underline">과제 상세 확인</Link>
  </div>;
  const preview = await getAssignmentPublishPreview(id);
  if (!preview || preview.expectedUpdatedAt !== assignment.updatedAt) return <p role="alert">과제 상태가 변경되었습니다. 상세 화면에서 최신 상태를 확인해 주세요.</p>;
  return <div className="max-w-3xl space-y-6">
    <h1 className="text-3xl font-bold">과제 공개 대상 확인</h1>
    <h2 className="text-xl font-bold">{assignment.title}</h2>
    <dl className="grid gap-2">
      <dt className="font-bold">대상 기수</dt><dd>{record.cohortName}</dd>
      <dt className="font-bold">마감 (한국시간)</dt><dd>{formatAssignmentKst(assignment.dueAt)}</dd>
      <dt className="font-bold">공개 예정 대상</dt><dd>{preview.targetCount}명</dd>
      <dt className="font-bold">현재 계정 미연결 대상</dt><dd>{preview.unlinkedCount}명</dd>
      <dt className="font-bold">명부 확인 시각 (한국시간)</dt><dd>{formatAssignmentKst(preview.reviewedAt)}</dd>
    </dl>
    <p>계정 미연결 학생도 대상에 포함됩니다. 계정을 연결하기 전에는 제출할 수 없습니다. 공개 후 새로 등록한 학생은 이 과제에 자동 추가되지 않습니다.</p>
    <p>공개 후에는 기수·수업·제목·안내·마감을 변경할 수 없습니다. 확인한 초안이나 명부가 바뀌면 공개를 중단하므로 최신 내용을 다시 확인해 주세요.</p>
    <AssignmentTransitionForm key={`${preview.expectedUpdatedAt}:${preview.expectedTargetFingerprint}`}
      kind="publish" assignmentId={id} requestId={randomUUID()} preview={preview}
      writable={process.env.ACADEMIC_ENROLLMENT_WRITES_ENABLED === "true"} />
  </div>;
}
