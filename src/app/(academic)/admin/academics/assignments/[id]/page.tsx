/** 과제 상세는 초안만 편집할 수 있고, 공개 후에는 저장된 정의와 최초 대상·실제 제출수만 표시한다. */
import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { getAssignmentAdmin, getAssignmentAdminAvailability, getAssignmentFormOptions } from "@/features/academics/assignments/admin-queries";
import { assignmentStatusLabels, formatAssignmentKst } from "@/features/academics/assignments/admin-display";
import { AssignmentPreparation } from "../_components/assignment-preparation";
import { AssignmentForm } from "../_components/assignment-form";
import { AssignmentTransitionForm } from "../_components/assignment-transition-form";

export const metadata: Metadata = { title: "과제 상세" };
export const dynamic = "force-dynamic";

export default async function AssignmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!await getAssignmentAdminAvailability()) return <AssignmentPreparation />;
  const record = await getAssignmentAdmin((await params).id);
  if (!record) notFound();
  const { assignment, targetCount } = record.result;
  const writable = process.env.ACADEMIC_ENROLLMENT_WRITES_ENABLED === "true";
  const options = assignment.status === "DRAFT" ? await getAssignmentFormOptions() : null;

  return <div className="space-y-7">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-3xl font-bold">과제 상세</h1>
      <Link href="/admin/academics/assignments" className="text-[#2563EB] underline">과제 목록</Link>
    </div>
    <h2 className="text-2xl font-bold">{assignment.title}</h2>
    <dl className="grid gap-2 sm:grid-cols-2">
      <dt className="font-bold">상태</dt><dd>{assignmentStatusLabels[assignment.status]}</dd>
      <dt className="font-bold">대상 기수</dt><dd>{record.cohortName}</dd>
      <dt className="font-bold">연결 수업</dt><dd>{record.eventTitle ?? "연결 없음"}{record.sessionLabel ? ` · ${record.sessionLabel}` : ""}</dd>
      <dt className="font-bold">마감 (한국시간)</dt><dd>{formatAssignmentKst(assignment.dueAt)}</dd>
      <dt className="font-bold">확정 대상</dt><dd>{assignment.status === "DRAFT" ? "공개 시 확정" : `${targetCount}명`}</dd>
      <dt className="font-bold">제출 완료</dt><dd>{record.submissionCount}명</dd>
    </dl>
    {assignment.status === "DRAFT" && options ? <section className="space-y-5">
      <h2 className="text-xl font-bold">초안 편집</h2>
      <AssignmentForm key={assignment.updatedAt} assignment={assignment} options={options} requestId={randomUUID()} writable={writable} />
      <Link href={`/admin/academics/assignments/${assignment.id}/publish`} className="inline-block rounded border border-[#D9D9D9] px-5 py-2">공개 대상 확인</Link>
    </section> : <section className="space-y-4">
      <h2 className="text-xl font-bold">과제 안내</h2>
      <p className="whitespace-pre-wrap break-words">{assignment.instructions || "과제 안내가 없습니다."}</p>
      <p className="text-[#666666]">공개된 과제의 기수·수업·제목·안내·마감은 수정하거나 삭제할 수 없습니다. 확정 대상은 최초 공개 시 명부를 기준으로 유지합니다.</p>
    </section>}
    {assignment.status !== "DRAFT" && <Link href={`/admin/academics/assignments/${assignment.id}/submissions`} className="inline-block text-[#2563EB] underline">대상별 제출 현황</Link>}
    {assignment.status === "PUBLISHED" && <AssignmentTransitionForm kind="close" assignmentId={assignment.id}
      requestId={randomUUID()} writable={writable} />}
    {assignment.status === "CLOSED" && <p role="status">종료된 과제입니다. 학생의 추가 제출을 받지 않습니다.</p>}
  </div>;
}
