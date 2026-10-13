/**
 * 지원서 질문 저장 요청을 DB 작업 전에 검증한다.
 * 선택지 값은 기존 저장 규칙처럼 양끝 공백만 제거하며 대소문자는 구분한다.
 */
import { z } from "zod/v4";

const optionSchema = z.object({
  id: z.string().uuid().optional(),
  value: z.string().trim().min(1, "선택지 내용을 입력해주세요."),
  order: z.number().int().default(0),
});

const selectionTypes = new Set(["MULTIPLE_CHOICE", "CHECKBOX", "DROPDOWN"]);

const questionSchema = z
  .object({
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
  })
  .superRefine((question, context) => {
    if (!selectionTypes.has(question.type)) return;

    const options = question.options ?? [];
    if (options.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "선택형 질문에는 선택지가 하나 이상 필요합니다.",
      });
    }

    // optionSchema가 먼저 trim한 저장 값을 비교해야 화면 응답과 DB 값이 일치한다.
    const seenValues = new Set<string>();
    for (const [index, option] of options.entries()) {
      if (seenValues.has(option.value)) {
        context.addIssue({
          code: "custom",
          path: ["options", index, "value"],
          message: "중복된 선택지는 저장할 수 없습니다.",
        });
      }
      seenValues.add(option.value);
    }
  });

export const saveQuestionsSchema = z.object({
  formId: z.string().uuid(),
  questions: z.array(questionSchema),
});

export type QuestionInput = z.infer<typeof questionSchema>;
