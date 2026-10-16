"use server";
/** 지정 승인자만 호출하는 명부 등록 액션. 매 호출 인가 후 검증하고 원자 등록을 실행한다. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertAcademicWritesEnabled, requireAcademicApprover } from "@/lib/academic-admin";
import { registerAcademicStudent, rosterErrorMessage } from "@/lib/db/academic-roster";
import { rosterInputSchema, type RosterFormState } from "../input";
import { assertAcademicEnabled } from "../availability";

export async function registerStudent(_previous: RosterFormState, formData: FormData): Promise<RosterFormState> {
  const actorId = await requireAcademicApprover();
  assertAcademicEnabled();
  assertAcademicWritesEnabled();
  const parsed = rosterInputSchema.safeParse({
    requestId: formData.get("requestId"), cohortId: formData.get("cohortId"),
    studentId: formData.get("studentId") ?? "", displayName: formData.get("displayName") ?? "",
    verificationMethod: formData.get("verificationMethod"), evidenceReference: formData.get("evidenceReference"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력 내용을 확인해 주세요." };
  let studentId: string;
  try {
    studentId = (await registerAcademicStudent(parsed.data, actorId)).studentId;
  } catch (error) {
    return { error: rosterErrorMessage(error) };
  }
  revalidatePath("/admin/academics/students");
  redirect(`/admin/academics/students/${studentId}`);
}
