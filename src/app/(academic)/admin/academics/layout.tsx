/** 홈페이지 관리자 레이아웃과 분리된 학사 승인자 전용 영역이다. */
import Link from "next/link";
import { getAcademicAvailability } from "@/features/academics/roster/availability";
import { AcademicPreparation } from "./_components/academic-preparation";

export default async function AcademicLayout({ children }: { children: React.ReactNode }) {
  const available = await getAcademicAvailability();
  return <div className="mx-auto max-w-6xl px-4 py-10 text-[#1a1a1a]">
    <nav aria-label="학사관리 메뉴" className="mb-8 flex flex-wrap gap-6 border-b border-[#D9D9D9] pb-4">
      <Link href="/admin/academics/students" className="font-bold text-[#2563EB]">학생 명부</Link>
      <Link href="/admin/academics/assignments" className="font-bold text-[#2563EB]">과제 관리</Link>
      <Link href="/mypage">마이페이지</Link>
    </nav>
    {available ? children : <AcademicPreparation />}
  </div>;
}
