/**
 * 지원서 제출 서버 액션 (동적 양식용)
 */
"use server";

import { and, count, eq, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import {
  applicationSubmissionsLog,
  applicationForms,
  applicationSubmissions,
  applicationAnswers,
} from "@/lib/db/schema";

/**
 * CSV/Excel 에서 셀 값이 수식으로 해석되는 것을 막기 위한 방어 함수입니다.
 */
function sanitizeCsvCell(val: unknown): string {
  const stringValue = String(val ?? "");
  const sanitizedValue = /^[=+\-@\t\r]/.test(stringValue) ? `'${stringValue}` : stringValue;

  return `"${sanitizedValue.replace(/"/g, '""')}"`;
}

/**
 * Postgres unique 제약 위반(에러코드 23505) 감지 헬퍼.
 * 동일 이메일이 같은 양식에 두 번 제출되려고 할 때 DB가 던지는 에러를 식별합니다.
 *
 * @param error 발생한 에러 객체
 * @param constraintName 선택적 제약 이름. 지정하면 해당 이름의 unique 위반만 true로 판정합니다.
 *                      이를 통해 미래에 다른 unique 제약이 추가되어도 메시지를 오진하지 않습니다.
 */
function isUniqueViolation(error: unknown, constraintName?: string): boolean {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    (error as { code: unknown }).code !== "23505"
  ) {
    return false;
  }
  if (constraintName === undefined) {
    return true;
  }
  return (
    "constraint" in error &&
    (error as { constraint: unknown }).constraint === constraintName
  );
}

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
  // 숨김 필드(honeypot)에 값이 들어오면 봇으로 간주하고, 사용자에게는 성공처럼 응답해 재시도를 유도하지 않습니다.
  // 필드명은 브라우저/패스워드매니저 자동완성을 회피하기 위해 의미 없는 프로젝트 prefix 이름을 사용합니다.
  // ('website', 'email' 등 일반 이름은 자동완성으로 정상 사용자도 채워질 수 있어 silent failure 위험이 큼)
  const honeypotValue = formData.get("hra_referral_source");
  if (honeypotValue) {
    return { success: true, message: "지원서가 성공적으로 제출되었습니다. 감사합니다!" };
  }

  const formId = formData.get("formId") as string;
  const applicantName = (formData.get("applicantName") as string)?.trim();
  const applicantEmail = (formData.get("applicantEmail") as string)?.trim().toLowerCase();
  const applicantPhone = (formData.get("applicantPhone") as string)?.trim();

  // 기본 정보 검증
  if (!applicantName) return { success: false, message: "이름을 입력해주세요." };
  if (!applicantEmail || !z.string().email().safeParse(applicantEmail).success) {
    return { success: false, message: "올바른 이메일 주소를 입력해주세요." };
  }
  if (!applicantPhone) return { success: false, message: "연락처를 입력해주세요." };

  try {
    // IP 기반 rate limit: 24시간 내 동일 IP에서 10건을 초과하면 차단합니다.
    // neon-http 드라이버는 트랜잭션을 지원하지 않아 카운트 조회와 로그 삽입 사이에
    // 짧은 TOCTOU 윈도우가 존재하지만, 동일 (form_id, email) 중복 제출은 아래의
    // unique 제약으로 원자적으로 차단되므로 실 익스플로잇 영향은 제한적입니다.
    // 더 엄격한 IP 제한이 필요하면 Vercel Edge Middleware 또는 Upstash Ratelimit 도입을 권장합니다.
    const hdrs = await headers();
    const ip =
      hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      hdrs.get("x-real-ip") ||
      hdrs.get("cf-connecting-ip") ||
      hdrs.get("x-vercel-forwarded-for") ||
      "unknown";
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [ipSubmissionCount] = await db
      .select({ c: count() })
      .from(applicationSubmissionsLog)
      .where(
        and(
          eq(applicationSubmissionsLog.ip, ip),
          gte(applicationSubmissionsLog.createdAt, since)
        )
      );

    if ((ipSubmissionCount?.c ?? 0) >= 10) {
      return { success: false, message: "잠시 후 다시 시도해주세요. (요청이 너무 많습니다)" };
    }

    // 1. 양식 및 질문 정보 조회
    const form = await db.query.applicationForms.findFirst({
      where: eq(applicationForms.id, formId),
      with: {
        questions: {
          with: {
            options: true,
          },
          orderBy: (questions, { asc }) => [asc(questions.order)],
        },
      },
    });

    if (!form || !form.isPublished) {
      return { success: false, message: "현재 접수 가능한 지원서가 아닙니다." };
    }

    // 2. 답변 수집 및 필수/화이트리스트 검증
    //    - CHECKBOX는 선택 개수와 무관하게 항상 JSON 배열로 직렬화하여 저장합니다.
    //      (단일/다중 일관성 보장, CSV 디코딩 측의 JSON.parse 와 짝이 맞음)
    //    - MULTIPLE_CHOICE/DROPDOWN은 단일 값 화이트리스트 검증을 합니다.
    const answers: { questionId: string; value: string }[] = [];

    for (const question of form.questions) {
      const rawValues = formData
        .getAll(`q-${question.id}`)
        .filter((v): v is string => typeof v === "string");

      let value = "";

      if (question.type === "CHECKBOX") {
        if (rawValues.length > 0) {
          const allowedOptions = new Set(question.options.map(option => option.value));
          if (rawValues.some(item => !allowedOptions.has(item))) {
            return {
              success: false,
              message: `[${question.title}] 선택지가 올바르지 않습니다.`,
            };
          }
          value = JSON.stringify(rawValues);
        }

        if (question.isRequired && rawValues.length === 0) {
          return { success: false, message: `[${question.title}] 항목은 필수입니다.` };
        }
      } else {
        value = rawValues[0] ?? "";

        if (question.isRequired && !value) {
          return { success: false, message: `[${question.title}] 항목은 필수입니다.` };
        }

        if (
          value &&
          (question.type === "MULTIPLE_CHOICE" || question.type === "DROPDOWN")
        ) {
          const allowedOptions = new Set(question.options.map(option => option.value));
          if (!allowedOptions.has(value)) {
            return {
              success: false,
              message: `[${question.title}] 선택지가 올바르지 않습니다.`,
            };
          }
        }
      }

      if (value) {
        answers.push({
          questionId: question.id,
          value,
        });
      }
    }

    // 3. 제출 마스터 생성.
    //    schema의 unique(form_id, applicant_email) 제약 덕분에 동일 이메일이
    //    같은 양식에 두 번 제출하려 하면 Postgres가 23505로 거부합니다.
    //    이는 TOCTOU race를 DB 레벨에서 원자적으로 차단합니다.
    let submissionId: string;
    try {
      const [submission] = await db
        .insert(applicationSubmissions)
        .values({
          formId,
          applicantName,
          applicantEmail,
          applicantPhone,
        })
        .returning({ id: applicationSubmissions.id });
      submissionId = submission.id;
    } catch (error) {
      if (isUniqueViolation(error, "application_submissions_form_applicant_unique")) {
        return {
          success: false,
          message: "이미 같은 이메일로 이 지원서를 제출하셨습니다.",
        };
      }
      throw error;
    }

    // 4. 질문별 답변 저장.
    //    중요(원자성 보상): neon-http 드라이버는 트랜잭션을 미지원하므로 마스터-답변 두 단계
    //    insert가 원자적이지 않습니다. 만약 답변 insert가 실패하면 이미 만들어진 마스터 행은
    //    unique(form_id, email) 제약 때문에 사용자의 영구 재시도 차단을 유발합니다.
    //    이를 막기 위해 답변 insert 실패 시 방금 만든 마스터 행을 best-effort로 삭제합니다.
    if (answers.length > 0) {
      try {
        await db.insert(applicationAnswers).values(
          answers.map(ans => ({
            submissionId,
            questionId: ans.questionId,
            value: ans.value,
          }))
        );
      } catch (answersError) {
        // 보상 삭제: 마스터 행을 지워 unique 제약을 해제하고 사용자의 재시도를 허용합니다.
        try {
          await db
            .delete(applicationSubmissions)
            .where(eq(applicationSubmissions.id, submissionId));
        } catch (cleanupError) {
          // 마스터 삭제마저 실패하면 고아 행이 남아 사용자가 재시도 불가일 수 있습니다.
          // 운영자가 수동으로 정리해야 하므로 식별 가능한 정보와 함께 로그를 남깁니다.
          console.error(
            "제출 마스터 정리 실패 — 고아 행 가능 (수동 정리 필요):",
            { submissionId, formId, applicantEmail, cleanupError }
          );
        }
        console.error("지원서 답변 저장 실패:", answersError);
        return {
          success: false,
          message: "제출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        };
      }
    }

    // 5. rate limit 카운트용 로그 적재.
    //    실패해도 제출 자체는 성공 처리합니다(다음 요청의 카운트가 1만큼 적게 잡힐 뿐).
    try {
      await db.insert(applicationSubmissionsLog).values({
        ip,
        email: applicantEmail,
      });
    } catch (error) {
      console.error("지원서 제출 로그 저장 오류:", error);
    }

    revalidatePath(`/admin/application-forms/${formId}/submissions`);
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
  await requireAdmin();

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
        } catch {
          return answer.value;
        }
      });

      return [...basicInfo, ...questionAnswers];
    });

    // CSV 문자열 생성 (쉼표 구분, 따옴표 처리)
    const csvContent = [
      headers.map(header => sanitizeCsvCell(header)).join(","),
      ...rows.map(row => row.map(val => sanitizeCsvCell(val)).join(","))
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
