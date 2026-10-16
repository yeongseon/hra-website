/** 지정 승인자가 과제 초안을 등록한다. 공개는 별도 대상 확인 화면에서 진행한다. */
import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { getAssignmentAdminAvailability, getAssignmentFormOptions } from "@/features/academics/assignments/admin-queries";
import { AssignmentPreparation } from "../_components/assignment-preparation";
import { AssignmentForm } from "../_components/assignment-form";

export const metadata: Metadata = { title: "과제 초안 등록" };
export const dynamic = "force-dynamic";

export default async function NewAssignmentPage() {
  if (!await getAssignmentAdminAvailability()) return <AssignmentPreparation />;
  const options = await getAssignmentFormOptions();
  return <div className="space-y-6">
    <h1 className="text-3xl font-bold">과제 초안 등록</h1>
    <p className="text-[#666666]">초안을 저장한 뒤 대상 명부와 마감을 확인하고 공개해 주세요.</p>
    <AssignmentForm options={options} requestId={randomUUID()} writable={process.env.ACADEMIC_ENROLLMENT_WRITES_ENABLED === "true"} />
  </div>;
}
