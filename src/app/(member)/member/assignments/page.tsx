/** 매 요청마다 실제 학생 세션과 본인 학적을 확인하는 내 과제 목록이다. */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AcademicAccessError } from "@/lib/academic-permissions";
import { getMyAssignments } from "@/features/academics/student-assignments/queries";
import { getMyAcademicUiContext } from "@/features/academics/student-assignments/ui-queries";
import { formatKstDateTime } from "@/lib/date-time";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "내 과제" };

export default async function MyAssignmentsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const search = await searchParams;
  const page = search.page === undefined ? 1 : Number(search.page);
  let context; let result;
  try {
    context = await getMyAcademicUiContext();
    if (context.hasActiveEnrollment) result = await getMyAssignments({ page });
  } catch (error) {
    if (error instanceof AcademicAccessError && error.status === 401) redirect("/login?callbackUrl=%2Fmember%2Fassignments");
    return <section className="mx-auto max-w-4xl space-y-4 px-4 py-12"><h1 className="text-3xl font-bold">내 과제</h1><p role="alert">{error instanceof AcademicAccessError && error.code === "DISABLED" ? "내 과제 기능을 준비하고 있습니다." : error instanceof AcademicAccessError ? error.message : "과제를 조회할 수 없습니다. 잠시 후 다시 시도해 주세요."}</p><Link href="/mypage" className="underline">마이페이지로 돌아가기</Link></section>;
  }
  if (!context.hasActiveEnrollment || !result) return <section className="mx-auto max-w-4xl space-y-5 px-4 py-12"><h1 className="text-3xl font-bold">내 과제</h1><p>현재 계정에 연결된 유효한 학생 학적이 없습니다. 운영 담당자에게 계정 연결과 기수 등록을 문의해 주세요.</p><Link href="/mypage" className="underline">마이페이지로 돌아가기</Link></section>;
    return <section className="mx-auto max-w-4xl space-y-6 px-4 py-12 text-[#1a1a1a]">
      <h1 className="text-3xl font-bold">내 과제</h1><p className="text-[#666666]">공개된 본인 과제와 최종 제출 결과를 확인하세요. 시각은 한국시간입니다.</p>
      {result.items.length === 0 && <p>아직 공개된 과제가 없습니다.</p>}
      <ul className="space-y-4">{result.items.map(item => <li key={item.targetId} className="rounded-xl border border-[#D9D9D9] p-5 shadow-[var(--shadow-soft)]">
        <h2 className="break-words text-xl font-semibold"><Link className="text-[#2563EB] underline" href={`/member/assignments/${item.assignmentId}`}>{item.title}</Link></h2>
        <p className="mt-3">마감: {formatKstDateTime(new Date(item.dueAt))}</p>
        <p>{item.submission ? `제출 완료 · ${formatKstDateTime(new Date(item.submission.submittedAt))}` : item.status === "CLOSED" || item.dueAt <= context.serverNow ? "미제출 · 마감" : "미제출"}</p>
      </li>)}</ul>
      <nav aria-label="내 과제 페이지" className="flex gap-4">{page > 1 && <Link href={`?page=${page - 1}`} className="underline">이전</Link>}<span>{page} 페이지</span>{result.hasNextPage && <Link href={`?page=${page + 1}`} className="underline">다음</Link>}</nav>
    </section>;

}
