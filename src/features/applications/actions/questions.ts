/**
 * 지원서 질문 및 선택지 관리 서버 액션
 */
"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import {
  applicationAnswers,
  applicationQuestions,
  applicationQuestionOptions,
} from "@/lib/db/schema";
import { logServerError } from "@/lib/errors";

const optionSchema = z.object({
  id: z.string().uuid().optional(),
  value: z.string().trim().min(1, "선택지 내용을 입력해주세요."),
  order: z.number().int().default(0),
});

const questionSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "질문 제목을 입력해주세요."),
  description: z.string().trim().optional().nullable(),
  type: z.enum([
    "SHORT_ANSWER",
    "LONG_ANSWER",
    "MULTIPLE_CHOICE",
    "CHECKBOX",
    "DROPDOWN",
  ]),
  isRequired: z.boolean().default(false),
  order: z.number().int().default(0),
  options: z.array(optionSchema).optional(),
});

const saveQuestionsSchema = z.object({
  formId: z.string().uuid(),
  questions: z.array(questionSchema),
});

export type QuestionActionState = {
  success: boolean;
  message: string;
};

/**
 * 지원서 양식의 전체 질문 및 선택지 저장 (일괄 업데이트)
 */
export async function saveFormQuestions(
  formId: string,
  questions: z.infer<typeof questionSchema>[]
): Promise<QuestionActionState> {
  // requireAdmin은 미인증 시 /login으로 redirect (NEXT_REDIRECT throw)되므로 catch 금지
  await requireAdmin();

  // 🛡️ formId 를 DB 조회 전에 UUID 검증합니다 (#70).
  // raw string 이 DB 로 흘러가면 Postgres 캐스팅 에러의 context 로 새어나가므로 사전 차단합니다.
  // 검증 실패 시 후속 로그 context 에도 원본 formId 대신 boolean flag(hasFormId) 만 남깁니다.
  const parsedFormId = z.uuid().safeParse(formId);
  if (!parsedFormId.success) {
    return {
      success: false,
      message: "잘못된 요청입니다.",
    };
  }
  const validFormId = parsedFormId.data;

  // 1. 데이터 검증 (description이 빈 문자열일 경우 null로 변환)
  const sanitizedQuestions = questions.map(q => ({
    ...q,
    description: q.description || null,
  }));

  const parsed = saveQuestionsSchema.safeParse({ formId: validFormId, questions: sanitizedQuestions });

  if (!parsed.success) {
    logServerError("application-questions/save/validation", parsed.error, {
      formId: validFormId,
      issueCount: parsed.error.issues.length,
      issueFields: parsed.error.issues
        .map((i) => i.path.join("."))
        .join(","),
    });
    return {
      success: false,
      message: parsed.error.issues[0].message,
    };
  }

  try {
    // 1. 현재 DB에 있는 이 양식의 모든 질문 ID 조회
    const existingQuestions = await db
      .select({ id: applicationQuestions.id })
      .from(applicationQuestions)
      .where(eq(applicationQuestions.formId, validFormId));

    const existingQuestionIds = existingQuestions.map(q => q.id);
    const incomingQuestionIds = parsed.data.questions
      .map(q => q.id)
      .filter((id): id is string => !!id);

    // 2. 삭제된 질문 제거 (cascade로 선택지도 함께 삭제됨)
    const questionIdsToDelete = existingQuestionIds.filter(
      id => !incomingQuestionIds.includes(id)
    );

    // 답변이 cascade 로 영구 삭제되는 것을 방지 — 운영자는 먼저 제출 내역을 별도 처리해야 함
    if (questionIdsToDelete.length > 0) {
      const answeredRows = await db
        .select({ questionId: applicationAnswers.questionId })
        .from(applicationAnswers)
        .where(inArray(applicationAnswers.questionId, questionIdsToDelete));

      const answeredQuestionIds = [...new Set(answeredRows.map(row => row.questionId))];

      if (answeredQuestionIds.length > 0) {
        const blockedQuestions = await db
          .select({ title: applicationQuestions.title })
          .from(applicationQuestions)
          .where(inArray(applicationQuestions.id, answeredQuestionIds));

        return {
          success: false,
          message: `다음 질문은 이미 답변이 제출되어 삭제할 수 없습니다: ${blockedQuestions.map(question => question.title).join(", ")}`,
        };
      }

      await db
        .delete(applicationQuestions)
        .where(inArray(applicationQuestions.id, questionIdsToDelete));
    }

    // 3. 질문 업데이트 또는 생성
    for (const q of parsed.data.questions) {
      let questionId = q.id;

      if (questionId && existingQuestionIds.includes(questionId)) {
        // 기존 질문 업데이트
        await db
          .update(applicationQuestions)
          .set({
            title: q.title,
            description: q.description,
            type: q.type,
            isRequired: q.isRequired,
            order: q.order,
          })
          .where(eq(applicationQuestions.id, questionId));
      } else {
        // 새 질문 생성
        const [newQuestion] = await db
          .insert(applicationQuestions)
          .values({
            formId: validFormId,
            title: q.title,
            description: q.description,
            type: q.type,
            isRequired: q.isRequired,
            order: q.order,
          })
          .returning({ id: applicationQuestions.id });
        questionId = newQuestion.id;
      }

      // 4. 선택지 처리: 기존 선택지 삭제 후 재생성
      await db
        .delete(applicationQuestionOptions)
        .where(eq(applicationQuestionOptions.questionId, questionId!));

      if (["MULTIPLE_CHOICE", "CHECKBOX", "DROPDOWN"].includes(q.type) && q.options && q.options.length > 0) {
        await db
          .insert(applicationQuestionOptions)
          .values(
            q.options.map(opt => ({
              questionId: questionId!,
              value: opt.value,
              order: opt.order,
            }))
          );
      }
    }

    revalidatePath(`/admin/application-forms/${validFormId}`);
    return {
      success: true,
      message: "질문 항목이 저장되었습니다.",
    };
  } catch (error) {
    logServerError("application-questions/save", error, {
      formId: validFormId,
      questionCount: parsed.data.questions.length,
    });
    return {
      success: false,
      message: "질문 저장 중 오류가 발생했습니다: " + (error instanceof Error ? error.message : "알 수 없는 오류"),
    };
  }
}
