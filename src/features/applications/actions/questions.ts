/**
 * 지원서 질문과 선택지를 PostgreSQL의 단일 저장 함수로 원자적으로 변경한다.
 * 양식 버전을 비교해 다른 관리자의 저장 결과를 오래된 화면이 덮어쓰지 못하게 한다.
 */
"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { logServerError } from "@/lib/errors";
import { isConstraintViolation } from "@/lib/db/constraint-errors";
import {
  saveQuestionsSchema,
  type QuestionInput,
} from "@/features/applications/question-validation";

export type QuestionActionState = {
  success: boolean;
  message: string;
  revision?: number;
  questionIds?: string[];
};

/** PostgreSQL 오류가 드라이버의 cause 체인 안에 있어도 지정한 저장 충돌만 구분한다. */
function isQuestionSaveError(error: unknown, message: string): boolean {
  const seen = new Set<object>();
  let current = error;
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && current.code === "P0001" &&
        "message" in current && typeof current.message === "string" &&
        current.message.includes(message)) return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

/** 입력 전체를 검증한 후 질문·선택지·버전을 한 문장으로 확정한다. */
export async function saveFormQuestions(
  formId: string,
  questions: QuestionInput[],
  expectedRevision: number,
): Promise<QuestionActionState> {
  // 인증 실패는 Next.js redirect 예외이므로 저장 오류 처리 범위에 넣지 않는다.
  await requireAdmin();

  const parsedFormId = z.uuid().safeParse(formId);
  const parsedRevision = z.number().int().nonnegative().safeParse(expectedRevision);
  if (!parsedFormId.success || !parsedRevision.success) {
    return { success: false, message: "잘못된 요청입니다." };
  }

  const sanitizedQuestions = questions.map(question => ({
    ...question,
    description: question.description || null,
  }));
  const parsed = saveQuestionsSchema.safeParse({
    formId: parsedFormId.data,
    questions: sanitizedQuestions,
  });
  if (!parsed.success) {
    logServerError("application-questions/save/validation", parsed.error, {
      formId: parsedFormId.data,
      issueCount: parsed.error.issues.length,
      issueFields: parsed.error.issues.map(issue => issue.path.join(".")).join(","),
    });
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    // 함수는 양식 행을 잠그고 버전을 비교한다. 함수 내부 오류는 이 문장 전체를 롤백한다.
    const result = await db.execute(sql`
      SELECT revision, question_ids
      FROM save_application_form_questions(
        ${parsedFormId.data}::uuid,
        ${parsedRevision.data}::integer,
        ${JSON.stringify(parsed.data.questions)}::jsonb
      )
    `);
    const saved = z.object({ revision: z.number().int(), question_ids: z.array(z.uuid()) })
      .safeParse(result.rows[0]);
    if (!saved.success || saved.data.question_ids.length !== parsed.data.questions.length) {
      throw new Error("질문 저장 함수의 결과가 요청과 일치하지 않습니다.");
    }

    revalidatePath(`/admin/application-forms/${parsedFormId.data}`);
    return {
      success: true,
      message: "질문 항목이 저장되었습니다.",
      revision: saved.data.revision,
      questionIds: saved.data.question_ids,
    };
  } catch (error) {
    if (isQuestionSaveError(error, "application_form_questions_stale")) {
      return { success: false, message: "다른 관리자가 질문을 변경했습니다. 새로고침 후 다시 저장해주세요." };
    }
    if (isQuestionSaveError(error, "application_form_questions_missing") ||
        isQuestionSaveError(error, "application_form_questions_invalid_id")) {
      return { success: false, message: "양식 또는 질문이 변경되었습니다. 새로고침 후 다시 확인해주세요." };
    }
    if (isConstraintViolation(error, "23503", "application_answers_question_id_application_questions_id_fk")) {
      return { success: false, message: "답변이 제출된 질문은 삭제할 수 없습니다. 새로고침 후 다시 확인해주세요." };
    }
    logServerError("application-questions/save", error, {
      formId: parsedFormId.data,
      questionCount: parsed.data.questions.length,
    });
    return { success: false, message: "질문 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." };
  }
}
