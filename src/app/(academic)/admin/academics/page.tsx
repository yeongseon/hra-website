/** 학사관리 기본 주소는 공개 준비를 확인한 뒤 학생 명부로 이동한다. */
import { redirect } from "next/navigation";
import { getAcademicAvailability } from "@/features/academics/roster/availability";
import { AcademicPreparation } from "./_components/academic-preparation";

export default async function AcademicPage() {
  if (!await getAcademicAvailability()) return <AcademicPreparation />;
  redirect("/admin/academics/students");
}
