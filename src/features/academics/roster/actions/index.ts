"use server";
/** 지정 승인자만 호출하는 명부 등록 액션. 매 호출 인가 후 검증하고 원자 등록을 실행한다. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertAcademicWritesEnabled, requireAcademicApprover } from "@/lib/academic-admin";
import { registerAcademicStudent, rosterErrorMessage } from "@/lib/db/academic-roster";
import { rosterInputSchema, type RosterFormState } from "../input";
import { assertAcademicEnabled } from "../availability";
import { academicSqlState, createAcademicObservation } from "@/lib/academic-observability";

export async function registerStudent(_previous: RosterFormState, formData: FormData): Promise<RosterFormState> {
  const observation = createAcademicObservation("STUDENT_REGISTER", "STUDENT");
  let actorId: string;
  try {
    actorId = await requireAcademicApprover();
    observation.authenticated(actorId);
    observation.emit("AUTHORIZED");
    assertAcademicEnabled();
    assertAcademicWritesEnabled();
  } catch (error) {
    observation.emit(observation.authenticatedActorId ? "FAILED" : "DENIED", {
      failureCode: observation.authenticatedActorId ? "GATE" : "AUTHORIZATION",
    });
    // 프레임워크의 기존 인가·준비 경계를 유지합니다. 원본은 로거에 넘기지 않습니다.
    throw error;
  }
  const parsed = rosterInputSchema.safeParse({
    requestId: formData.get("requestId"), cohortId: formData.get("cohortId"),
    studentId: formData.get("studentId") ?? "", displayName: formData.get("displayName") ?? "",
    verificationMethod: formData.get("verificationMethod"), evidenceReference: formData.get("evidenceReference"),
  });
  if (!parsed.success) {
    observation.emit("FAILED", { failureCode: "INPUT" });
    return { error: parsed.error.issues[0]?.message ?? "입력 내용을 확인해 주세요.", referenceId: observation.correlationId };
  }
  observation.identify({ requestId: parsed.data.requestId, resourceId: parsed.data.studentId });
  let studentId: string;
  try {
    studentId = (await registerAcademicStudent(parsed.data, actorId)).studentId;
    observation.emit("COMPLETED", { resourceId: studentId });
  } catch (error) {
    observation.emit("FAILED", { failureCode: "STORAGE", sqlState: academicSqlState(error) });
    return { error: rosterErrorMessage(error), referenceId: observation.correlationId };
  }
  revalidatePath("/admin/academics/students");
  redirect(`/admin/academics/students/${studentId}`);
}
