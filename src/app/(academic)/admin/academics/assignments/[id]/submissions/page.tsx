/** 지정된 학사 승인자가 공개 당시 대상 전원의 제출·미제출을 확인하는 동적 서버 화면이다. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { listAssignmentSubmissionStatuses } from "@/features/academics/submission-statuses/queries";
import { SubmissionStatusError, submissionStatusRequestInput } from "@/features/academics/submission-statuses/contracts";
import { formatKstDateTimeWithSeconds } from "@/lib/date-time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "과제 제출 현황" };

export default async function AssignmentSubmissionsPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  let result;
  try { result = await listAssignmentSubmissionStatuses(submissionStatusRequestInput(id, query)); } catch (error) {
    if (error instanceof SubmissionStatusError && error.status === 404) notFound();
    if (error instanceof SubmissionStatusError && error.status === 403) redirect("/login");
    return <section className="space-y-4"><h1 className="text-2xl font-bold">과제 제출 현황</h1>
      <p role="alert">{error instanceof SubmissionStatusError ? error.message : "제출 현황을 조회할 수 없습니다."}</p>
      <Link href={`/admin/academics/assignments/${id}/submissions`} className="underline">조회 조건 초기화</Link></section>;
  }
  const pageHref = (page: number) => { const next = new URLSearchParams(query); next.set("page", String(page)); return `?${next}`; };
  const pages = Math.max(1, Math.ceil(result.filteredCount / result.pageSize));
  return <section className="space-y-6 text-[#1a1a1a]">
    <div><h1 className="text-2xl font-bold">{result.assignment.title} 제출 현황</h1><p className="mt-2 text-sm text-[#666666]">과제 최초 공개 당시의 대상 학생을 기준으로 집계합니다.</p></div>
    <dl className="flex flex-wrap gap-6 rounded-lg border border-[#D9D9D9] p-4">
      <div><dt>대상</dt><dd className="text-xl font-semibold">{result.counts.total}명</dd></div>
      <div><dt>제출</dt><dd className="text-xl font-semibold">{result.counts.submitted}명</dd></div>
      <div><dt>미제출</dt><dd className="text-xl font-semibold">{result.counts.unsubmitted}명</dd></div>
    </dl>
    <form method="get" className="flex flex-wrap items-end gap-3">
      {query.get("cohortId") && <input type="hidden" name="cohortId" value={query.get("cohortId") ?? ""} />}
      <label className="space-y-1">이름 검색<input name="search" defaultValue={query.get("search") ?? ""} maxLength={100} className="block rounded border border-[#D9D9D9] p-2" /></label>
      <label className="space-y-1">제출 상태<select name="status" defaultValue={query.get("status") ?? "ALL"} className="block rounded border border-[#D9D9D9] p-2"><option value="ALL">전체</option><option value="SUBMITTED">제출</option><option value="UNSUBMITTED">미제출</option></select></label>
      <label className="space-y-1">정렬<select name="sort" defaultValue={query.get("sort") ?? "name"} className="block rounded border border-[#D9D9D9] p-2"><option value="name">이름</option><option value="submittedAt">제출 시각</option></select></label>
      <label className="space-y-1">정렬 방향<select name="direction" defaultValue={query.get("direction") ?? "asc"} className="block rounded border border-[#D9D9D9] p-2"><option value="asc">오름차순</option><option value="desc">내림차순</option></select></label>
      <button className="rounded bg-[#1a1a1a] px-4 py-2 text-white hover:bg-[#333333]">조회</button>
    </form>
    <div className="flex flex-wrap justify-between gap-3"><p>검색 결과 {result.filteredCount}명</p><a href={`/api/academic/assignments/${id}/submissions/export?${query}`} className="text-[#2563EB] underline">현재 조건으로 CSV 다운로드</a></div>
    <div className="overflow-x-auto"><table className="w-full border-collapse text-left"><caption className="sr-only">학생별 최종 제출 상태와 한국시간 제출 시각</caption>
      <thead><tr className="border-b border-[#D9D9D9]"><th scope="col" className="p-3">이름</th><th scope="col" className="p-3">등록 상태</th><th scope="col" className="p-3">제출 상태</th><th scope="col" className="p-3">제출 시각(한국시간)</th></tr></thead>
      <tbody>{result.rows.map(row => <tr key={row.targetId} className="border-b border-[#D9D9D9]"><td className="p-3">{row.displayName}</td><td className="p-3">{!row.accountLinked ? "계정 미연결" : !row.enrollmentActive ? "등록 종료 또는 비활성" : "등록"}</td><td className="p-3">{row.submittedAt ? "제출" : "미제출"}</td><td className="p-3">{row.submittedAt ? formatKstDateTimeWithSeconds(new Date(row.submittedAt)) : "—"}</td></tr>)}</tbody>
    </table>{result.rows.length === 0 && <p className="p-6 text-center text-[#666666]">조회 조건에 맞는 대상 학생이 없습니다.</p>}</div>
    <nav aria-label="제출 현황 페이지" className="flex gap-4">{result.page > 1 && <Link href={pageHref(result.page - 1)} className="underline">이전</Link>}<span>{result.page} / {pages} 페이지</span>{result.page < pages && <Link href={pageHref(result.page + 1)} className="underline">다음</Link>}</nav>
  </section>;
}
