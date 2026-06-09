/**
 * 지원서 제출 서버 액션 (동적 양식용)
 */
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import {
  applicationForms,
  applicationQuestions,
  applicationSubmissions,
  applicationAnswers,
} from "@/lib/db/schema";

export type SubmitActionState = {
  success: boolean;
  message: string;
};

/**
 * 지원서 제출 처리
 */
export async function submitApplicationForm(
  _prevState: SubmitActionState,
  formData: FormData
): Promise<SubmitActionState> {
  const formId = formData.get("formId") as string;
  const applicantName = (formData.get("applicantName") as string)?.trim();
  const applicantEmail = (formData.get("applicantEmail") as string)?.trim().toLowerCase();
  const applicantPhone = (formData.get("applicantPhone") as string)?.trim();

  // 기본 정보 검증
  if (!applicantName) return { success: false, message: "이름을 입력해주세요." };
  if (!applicantEmail || !z.string().email().safeParse(applicantEmail).success) {
    return { success: false, message: "올바른 이메일 주소를 입력해주세요." };
  }

  try {
    // 1. 양식 및 질문 정보 조회
    const form = await db.query.applicationForms.findFirst({
      where: eq(applicationForms.id, formId),
      with: {
        questions: true,
      },
    });

    if (!form || !form.isPublished) {
      return { success: false, message: "현재 접수 가능한 지원서가 아닙니다." };
    }

    // 2. 답변 수집 및 필수 항목 검증
    const answers: { questionId: string; value: string }[] = [];

    for (const question of form.questions) {
      // 체크박스의 경우 여러 값이 올 수 있음
      const rawValues = formData.getAll(`q-${question.id}`);
      const value = rawValues.length > 1 ? JSON.stringify(rawValues) : (rawValues[0] as string || "");

      if (question.isRequired && (!value || value === "[]")) {
        return { success: false, message: `[${question.title}] 항목은 필수입니다.` };
      }

      if (value) {
        answers.push({
          questionId: question.id,
          value,
        });
      }
    }

    // 3. DB 저장: 제출 마스터 먼저 생성 후 답변 저장
    const [submission] = await db
      .insert(applicationSubmissions)
      .values({
        formId,
        applicantName,
        applicantEmail,
        applicantPhone,
      })
      .returning({ id: applicationSubmissions.id });

    // 질문별 답변 저장
    if (answers.length > 0) {
      await db
        .insert(applicationAnswers)
        .values(
          answers.map(ans => ({
            submissionId: submission.id,
            questionId: ans.questionId,
            value: ans.value,
          }))
        );
    }

    revalidatePath(`/admin/recruitment/forms/${formId}/submissions`);
    return {
      success: true,
      message: "지원서가 성공적으로 제출되었습니다. 감사합니다!",
    };
  } catch (error) {
    console.error("지원서 제출 오류:", error);
    return {
      success: false,
      message: "제출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
    };
  }
}

/**
 * 제출 내역 CSV 내보내기용 데이터 조회
 */
export async function exportSubmissionsToCsv(formId: string) {
  try {
    // 1. 양식 및 질문 정보 조회
    const form = await db.query.applicationForms.findFirst({
      where: eq(applicationForms.id, formId),
      with: {
        questions: {
          orderBy: (questions, { asc }) => [asc(questions.order)],
        },
      },
    });

    if (!form) throw new Error("양식을 찾을 수 없습니다.");

    // 2. 제출 내역 및 답변 조회
    const submissions = await db.query.applicationSubmissions.findMany({
      where: eq(applicationSubmissions.formId, formId),
      with: {
        answers: true,
      },
      orderBy: (submissions, { desc }) => [desc(submissions.submittedAt)],
    });

    // 3. CSV 헤더 구성
    const headers = ["이름", "이메일", "연락처", "제출일시", "상태", ...form.questions.map(q => q.title)];
    
    // 4. 데이터 행 구성
    const rows = submissions.map(sub => {
      const basicInfo = [
        sub.applicantName,
        sub.applicantEmail,
        sub.applicantPhone || "",
        sub.submittedAt.toISOString(),
        sub.status,
      ];

      const questionAnswers = form.questions.map(q => {
        const answer = sub.answers.find(ans => ans.questionId === q.id);
        if (!answer) return "";
        
        try {
          const parsed = JSON.parse(answer.value);
          return Array.isArray(parsed) ? parsed.join(", ") : answer.value;
        } catch (e) {
          return answer.value;
        }
      });

      return [...basicInfo, ...questionAnswers];
    });

    // CSV 문자열 생성 (쉼표 구분, 따옴표 처리)
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    // Excel에서 한글 깨짐 방지를 위한 BOM(Byte Order Mark) 추가
    return {
      success: true,
      filename: `${form.title}_제출내역_${new Date().toISOString().split('T')[0]}.csv`,
      data: "\ufeff" + csvContent,
    };
  } catch (error) {
    console.error("CSV 내보내기 오류:", error);
    return { success: false, message: "데이터 추출 중 오류가 발생했습니다." };
  }
}
