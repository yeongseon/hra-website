/** 지정 승인자가 운영 검증을 마친 학생을 등록한다. 계정 연결은 이 폼의 범위가 아니다. */
import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { z } from "zod/v4";
import { getRosterCohorts } from "@/features/academics/roster/queries";
import { RosterForm } from "../_components/roster-form";
import { getAcademicAvailability } from "@/features/academics/roster/availability";
import { AcademicPreparation } from "../../_components/academic-preparation";

export const metadata: Metadata = { title: "학생 등록" };
export const dynamic = "force-dynamic";

export default async function NewStudentPage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  if (!await getAcademicAvailability()) return <AcademicPreparation />;
  const cohorts = await getRosterCohorts();
  if (process.env.ACADEMIC_ENROLLMENT_WRITES_ENABLED !== "true") return <div className="space-y-4"><h1 className="text-3xl font-bold">학생 등록</h1><p>학생 등록 기능을 준비하고 있습니다. 현재는 등록된 학생 명부를 조회할 수 있습니다.</p></div>;
  const { student } = await searchParams;
  if (student && !z.uuid().safeParse(student).success) return <p role="alert">학생 식별자가 올바르지 않습니다.</p>;
  return <div className="space-y-6"><h1 className="text-3xl font-bold">학생 등록</h1>
    <p className="text-[#666666]">본인 확인과 등록 승인을 마친 학생만 추가해 주세요. 등록 시 회원 역할과 로그인 계정은 자동으로 변경되지 않습니다.</p>
    <RosterForm cohorts={cohorts} requestId={randomUUID()} studentId={student} />
  </div>;
}
