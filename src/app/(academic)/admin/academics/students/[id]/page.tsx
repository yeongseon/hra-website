/** 학생 상세에는 필요한 학적만 표시하고 연락처나 계정 자격정보는 조회하지 않는다. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAcademicStudent } from "@/features/academics/roster/queries";

import { getAcademicAvailability } from "@/features/academics/roster/availability";
import { AcademicPreparation } from "../../_components/academic-preparation";

export const metadata: Metadata = { title: "학생 상세" };
export const dynamic = "force-dynamic";

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  if (!await getAcademicAvailability()) return <AcademicPreparation />;
  const student = await getAcademicStudent((await params).id);
  if (!student) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">학생 상세</h1>
      <dl className="grid gap-2">
        <dt className="font-bold">표시 이름</dt><dd>{student.displayName}</dd>
        <dt className="font-bold">학생 식별자</dt><dd className="break-all">{student.id}</dd>
        <dt className="font-bold">계정 연결</dt><dd>{student.linked ? "연결됨" : "미연결"}</dd>
      </dl>
      <h2 className="text-xl font-bold">기수 등록 이력</h2>
      <ul className="space-y-2">
        {student.enrollments.map(enrollment => (
          <li key={enrollment.id}>
            {enrollment.cohortName} · 등록 · {enrollment.enrolledAt.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}
          </li>
        ))}
      </ul>
      {!student.enrollments.length && <p>등록된 기수가 없습니다.</p>}
      <p className="text-[#666666]">표시 이름 수정·학생 제외·삭제·계정 재연결은 보존 정책 확정 후 제공합니다.</p>
      <Link className="text-[#2563EB] underline" href={`/admin/academics/students/new?student=${student.id}`}>
        이 학생을 다른 기수에 등록
      </Link>
    </div>
  );
}
