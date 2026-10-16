/** 지정 승인자가 과제 상태·마감·고정 대상수·실제 제출수를 조회하는 관리 목록이다. */
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod/v4";
import { getAssignmentAdminAvailability, getAssignmentAdminList, getAssignmentCohorts } from "@/features/academics/assignments/admin-queries";
import { assignmentStatusLabels, formatAssignmentKst } from "@/features/academics/assignments/admin-display";
import { AssignmentPreparation } from "./_components/assignment-preparation";

export const metadata: Metadata = { title: "학사 과제 관리" };
export const dynamic = "force-dynamic";
const filters = z.object({ cohort: z.uuid().optional(), status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]).optional(),
  page: z.coerce.number().int().min(1).max(201).default(1) });

export default async function AssignmentsPage({ searchParams }: {
  searchParams: Promise<{ cohort?: string; status?: string; page?: string }>;
}) {
  if (!await getAssignmentAdminAvailability()) return <AssignmentPreparation />;
  const params = await searchParams;
  const parsed = filters.safeParse({ cohort: params.cohort || undefined, status: params.status || undefined, page: params.page });
  if (!parsed.success) return <p role="alert">과제 조회 조건이 올바르지 않습니다.</p>;
  const { cohort, status, page } = parsed.data;
  const [options, records] = await Promise.all([
    getAssignmentCohorts(), getAssignmentAdminList({ cohortId: cohort, status, limit: 50, offset: (page - 1) * 50 }),
  ]);
  const href = (next: number) => `/admin/academics/assignments?${new URLSearchParams({
    ...(cohort ? { cohort } : {}), ...(status ? { status } : {}), page: String(next),
  })}`;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-3xl font-bold">과제 관리</h1>
      <Link href="/admin/academics/assignments/new" className="rounded bg-[#1a1a1a] px-4 py-2 text-white">과제 초안 등록</Link>
    </div>
    <form className="flex flex-wrap items-end gap-4">
      <div className="space-y-1">
        <label htmlFor="assignment-filter-cohort" className="block">대상 기수</label>
        <select id="assignment-filter-cohort" name="cohort" defaultValue={cohort ?? ""} className="rounded border border-[#D9D9D9] p-2">
          <option value="">전체 기수</option>{options.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="assignment-filter-status" className="block">과제 상태</label>
        <select id="assignment-filter-status" name="status" defaultValue={status ?? ""} className="rounded border border-[#D9D9D9] p-2">
          <option value="">전체 상태</option>{Object.entries(assignmentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <button type="submit" className="rounded border border-[#D9D9D9] px-4 py-2">조회</button>
    </form>
    <p className="text-[#666666]">대상은 최초 공개 시 확정됩니다. 제출 완료 수는 실제 제출 기록을 집계합니다.</p>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[650px] text-left">
        <caption className="sr-only">과제 목록</caption>
        <thead><tr className="border-b border-[#D9D9D9]">
          {['과제', '기수', '상태', '마감 (한국시간)', '확정 대상', '제출 완료'].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}
        </tr></thead>
        <tbody>{records.map(record => {
          const { assignment, targetCount } = record.result;
          return <tr key={assignment.id} className="border-b border-[#D9D9D9]">
            <td className="p-3"><Link href={`/admin/academics/assignments/${assignment.id}`} className="text-[#2563EB] underline">{assignment.title}</Link></td>
            <td className="p-3">{record.cohortName}</td><td className="p-3">{assignmentStatusLabels[assignment.status]}</td>
            <td className="p-3">{formatAssignmentKst(assignment.dueAt)}</td>
            <td className="p-3">{assignment.status === "DRAFT" ? "미확정" : `${targetCount}명`}</td>
            <td className="p-3">{record.submissionCount}명</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {!records.length && <p>조회된 과제가 없습니다.</p>}
    <nav aria-label="과제 목록 페이지" className="flex gap-6">
      {page > 1 && <Link href={href(page - 1)}>이전 페이지</Link>}
      {records.length === 50 && page < 201 && <Link href={href(page + 1)}>다음 페이지</Link>}
    </nav>
  </div>;
}
