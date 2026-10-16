/** 지정 승인자가 기수별 학생 수와 계정 연결 여부를 확인하는 명부 화면이다. */
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod/v4";
import { getAcademicRoster, getRosterCohorts } from "@/features/academics/roster/queries";

import { getAcademicAvailability } from "@/features/academics/roster/availability";
import { AcademicPreparation } from "../_components/academic-preparation";

export const metadata: Metadata = { title: "학사 학생 명부" };
export const dynamic = "force-dynamic";

export default async function StudentsPage({ searchParams }: {
  searchParams: Promise<{ cohort?: string; page?: string }>;
}) {
  if (!await getAcademicAvailability()) return <AcademicPreparation />;
  const params = await searchParams;
  // 조작된 식별자가 들어오면 전체 명부를 대신 보여주지 않는다.
  if (params.cohort && !z.uuid().safeParse(params.cohort).success) {
    return <p role="alert">기수 식별자가 올바르지 않습니다.</p>;
  }
  const page = /^\d+$/.test(params.page ?? "") ? Math.max(1, Math.min(Number(params.page), 100000)) : 1;
  const [cohorts, roster] = await Promise.all([
    getRosterCohorts(), getAcademicRoster(params.cohort, page),
  ]);
  const href = (next: number) => `/admin/academics/students?${new URLSearchParams({
    ...(params.cohort ? { cohort: params.cohort } : {}), page: String(next),
  })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">학생 명부</h1>
        <Link className="rounded bg-[#1a1a1a] px-4 py-2 text-white" href="/admin/academics/students/new">학생 등록</Link>
      </div>
      <p className="text-[#666666]">
        수동 검증한 학생의 등록 및 조회를 제공합니다. 계정 연결은 별도의 검증 절차로 진행하며,
        수정·제외·삭제는 보존 정책 확정 후 제공합니다.
      </p>
      <form className="flex items-end gap-3">
        <label className="flex flex-col gap-1">
          기수
          <select name="cohort" defaultValue={params.cohort ?? ""} className="rounded border border-[#D9D9D9] p-2">
            <option value="">전체 기수</option>
            {cohorts.map(cohort => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}
          </select>
        </label>
        <button className="rounded border border-[#D9D9D9] px-4 py-2" type="submit">조회</button>
      </form>
      <p aria-live="polite">전체 학생 {roster.total}명 · 계정 연결 {roster.total - roster.unlinked}명 · 미연결 {roster.unlinked}명</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <caption className="sr-only">기수별 학생 명부</caption>
          <thead>
            <tr className="border-b border-[#D9D9D9]">
              <th className="p-3">표시 이름</th><th className="p-3">계정 연결</th><th className="p-3">등록 상태</th>
            </tr>
          </thead>
          <tbody>
            {roster.students.map(student => (
              <tr key={student.id} className="border-b border-[#D9D9D9]">
                <td className="p-3">
                  <Link className="text-[#2563EB] underline" href={`/admin/academics/students/${student.id}`}>{student.displayName}</Link>
                </td>
                <td className="p-3">{student.linked ? "연결됨" : "미연결"}</td>
                <td className="p-3">{student.enrollmentCount ? `등록 (${student.enrollmentCount}개 기수)` : "등록 기수 없음"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!roster.students.length && <p>조회된 학생이 없습니다.</p>}
      <nav aria-label="명부 페이지" className="flex gap-6">
        {page > 1 && <Link href={href(page - 1)}>이전 페이지</Link>}
        {page * 100 < roster.total && <Link href={href(page + 1)}>다음 페이지</Link>}
      </nav>
    </div>
  );
}
