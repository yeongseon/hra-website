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
  applicationQuestions,
  applicationQuestionOptions,
  applicationQuestionTypeEnum,
} from "@/lib/db/schema";

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
  questions: any[]
): Promise<QuestionActionState> {
  console.log("--- saveFormQuestions 시작 ---");
  try {
    await requireAdmin();
    console.log("requireAdmin 통과");
  } catch (error) {
    console.error("requireAdmin 실패:", error);
    return { success: false, message: "인증되지 않았습니다." };
  }

  // 1. 데이터 검증 (description이 빈 문자열일 경우 null로 변환)
  const sanitizedQuestions = questions.map(q => ({
    ...q,
    description: q.description || null,
  }));

  const parsed = saveQuestionsSchema.safeParse({ formId, questions: sanitizedQuestions });

  if (!parsed.success) {
    console.error("Zod 검증 실패:", parsed.error.issues);
    return {
      success: false,
      message: parsed.error.issues[0].message,
    };
  }

  try {
    await db.transaction(async (tx) => {
      // 1. 현재 DB에 있는 이 양식의 모든 질문 ID 조회
      const existingQuestions = await tx
        .select({ id: applicationQuestions.id })
        .from(applicationQuestions)
        .where(eq(applicationQuestions.formId, formId));
      
      const existingQuestionIds = existingQuestions.map(q => q.id);
      const incomingQuestionIds = parsed.data.questions
        .map(q => q.id)
        .filter((id): id is string => !!id);

      // 2. 삭제된 질문 처리
      const questionIdsToDelete = existingQuestionIds.filter(
        id => !incomingQuestionIds.includes(id)
      );
      
      if (questionIdsToDelete.length > 0) {
        await tx
          .delete(applicationQuestions)
          .where(inArray(applicationQuestions.id, questionIdsToDelete));
      }

      // 3. 질문 업데이트 또는 생성
      for (const q of parsed.data.questions) {
        let questionId = q.id;

        if (questionId && existingQuestionIds.includes(questionId)) {
          // 기존 질문 업데이트
          await tx
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
          const [newQuestion] = await tx
            .insert(applicationQuestions)
            .values({
              formId,
              title: q.title,
              description: q.description,
              type: q.type,
              isRequired: q.isRequired,
              order: q.order,
            })
            .returning({ id: applicationQuestions.id });
          questionId = newQuestion.id;
        }

        // 4. 선택지 처리 (객관식 등)
        if (["MULTIPLE_CHOICE", "CHECKBOX", "DROPDOWN"].includes(q.type) && q.options) {
          // 기존 선택지 모두 삭제 후 재생성 (가장 간단한 방식)
          await tx
            .delete(applicationQuestionOptions)
            .where(eq(applicationQuestionOptions.questionId, questionId));

          if (q.options.length > 0) {
            await tx
              .insert(applicationQuestionOptions)
              .values(
                q.options.map(opt => ({
                  questionId: questionId!,
                  value: opt.value,
                  order: opt.order,
                }))
              );
          }
        } else {
          // 주관식 등으로 바뀐 경우 기존 선택지 삭제
          await tx
            .delete(applicationQuestionOptions)
            .where(eq(applicationQuestionOptions.questionId, questionId));
        }
      }
      console.log("트랜잭션 내부 처리 완료");
    });

    console.log("트랜잭션 전체 완료");
    revalidatePath(`/admin/application-forms/${formId}`);
    return {
      success: true,
      message: "질문 항목이 저장되었습니다.",
    };
  } catch (error) {
    console.error("질문 저장 중 DB 트랜잭션 오류:", error);
    return {
      success: false,
      message: "질문 저장 중 오류가 발생했습니다: " + (error instanceof Error ? error.message : "알 수 없는 오류"),
    };
  }
}
