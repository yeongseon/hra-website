/** 본인 대상만 상세 조회하고 DB 현재 시각으로 새 제출 가능 여부를 안내하는 서버 화면이다. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AcademicAccessError } from "@/lib/academic-permissions";
import { getMyAssignment } from "@/features/academics/student-assignments/queries";
import { getMyAcademicUiContext } from "@/features/academics/student-assignments/ui-queries";
import { formatKstDateTimeWithSeconds } from "@/lib/date-time";
import { FileSubmissionForm } from "../_components/file-submission-form";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "과제 상세" };

export default async function MyAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let assignment; let context;
  try { context = await getMyAcademicUiContext(); assignment = await getMyAssignment(id); }
  catch (error) {
    if (error instanceof AcademicAccessError && error.status === 401) redirect("/login?callbackUrl=%2Fmember%2Fassignments");
    if (error instanceof AcademicAccessError && error.status === 404) notFound();
    return <section className="mx-auto max-w-4xl space-y-4 px-4 py-12"><h1 className="text-2xl font-bold">과제 상세</h1><p role="alert">{error instanceof AcademicAccessError ? error.message : "과제를 조회할 수 없습니다."}</p><Link href="/member/assignments" className="underline">내 과제로 돌아가기</Link></section>;
  }
  const open = assignment.status === "PUBLISHED" && new Date(assignment.dueAt).getTime() > new Date(context.serverNow).getTime();
  return <article className="mx-auto max-w-4xl space-y-6 px-4 py-12 text-[#1a1a1a]">
    <Link href="/member/assignments" className="text-[#2563EB] underline">내 과제 목록</Link>
    <h1 className="break-words text-3xl font-bold">{assignment.title}</h1>
    <p>제출 마감: {formatKstDateTimeWithSeconds(new Date(assignment.dueAt))} (한국시간)</p>
    <section aria-label="과제 안내" className="whitespace-pre-wrap break-words rounded-xl border border-[#D9D9D9] p-5">{assignment.instructions || "추가 안내가 없습니다."}</section>
    <FileSubmissionForm assignment={assignment} open={open} />
  </article>;
}
