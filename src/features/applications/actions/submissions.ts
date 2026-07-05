/**
 * 지원서 제출 서버 액션 (동적 양식용)
 */
"use server";

import { and, count, eq, gte, sql } from "drizzle-orm";
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
import { logServerError } from "@/lib/errors";
import { checkApplicationSubmissionHourlyLimit } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/rate-limit-core";

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

  // Oracle Phase D 5라운드 BLOCK 수정 — hidden 필드 formId 를 UUID 로 사전 검증.
  // formData 로 전송되는 formId 는 라우트 파라미터와 달리 지금까지 zod 검증 없이 DB
  // 쿼리(line 119: eq(applicationForms.id, formId))에 그대로 흘러갔다. UUID 형식이
  // 아닌 값이 Postgres 로 도달하면 `invalid input syntax for type uuid: "..."` 캐스트
  // 에러가 발생하고 raw ID 가 Vercel Logs 에 노출된다(logServerError 는 SQL/PII 패턴만
  // 마스킹하고 UUID 문법 에러의 원본 텍스트는 통과시킴). 사용자 입력 오타가 아니라
  // 폼 조작 시나리오이므로 일반 오류 메시지로 응답한다.
  const parsedFormId = z.uuid().safeParse(formId);
  if (!parsedFormId.success) {
    return { success: false, message: "잘못된 요청입니다." };
  }
  const validFormId = parsedFormId.data;

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
    // IP 기반 rate limit — 두 층 병행 (#69):
    //   (a) 24시간 10회 (총량): 장기 abuse 방어. 인라인 카운트 유지.
    //   (b) 시간당 5회 (스퍼트): 봇의 짧은 시간창 폭주 방어. 헬퍼로 분리.
    // neon-http 는 트랜잭션이 없어 카운트-후-삽입 사이에 짧은 TOCTOU 창이 있으나,
    // 동일 (form_id, email) 중복은 아래 unique 제약이 원자적으로 차단하므로
    // 실 익스플로잇 영향은 제한적. 더 엄격한 제한이 필요하면 Upstash Ratelimit 도입.
    const hdrs = await headers();
    const ip = extractClientIp(hdrs);
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

    const hourly = await checkApplicationSubmissionHourlyLimit(ip);
    if (hourly.blocked) {
      return { success: false, message: "잠시 후 다시 시도해주세요. (요청이 너무 많습니다)" };
    }

    // 1. 양식 및 질문 정보 조회
    const form = await db.query.applicationForms.findFirst({
      where: eq(applicationForms.id, validFormId),
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
          formId: validFormId,
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
          // 운영자가 수동으로 정리해야 하므로 식별자만 남깁니다.
          // #70: applicantEmail 은 PII 이므로 로그에서 제외 — submissionId·formId 로 운영자가 역추적 가능.
          logServerError("application-submission/cleanup-master", cleanupError, {
            submissionId,
            formId: validFormId,
          });
        }
        logServerError("application-submission/insert-answers", answersError, {
          submissionId,
          formId: validFormId,
        });
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
      logServerError("application-submission/insert-log", error);
    }

    revalidatePath(`/admin/application-forms/${validFormId}/submissions`);
    return {
      success: true,
      message: "지원서가 성공적으로 제출되었습니다. 감사합니다!",
    };
  } catch (error) {
    logServerError("application-submission/submit", error);
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

  // 🛡️ formId 를 DB 조회 전에 UUID 검증합니다 (#70).
  // raw string 이 DB 로 흘러가면 Postgres 캐스팅 에러의 context 로 새어나가므로 사전 차단합니다.
  const parsedFormId = z.uuid().safeParse(formId);
  if (!parsedFormId.success) {
    return { success: false, message: "잘못된 요청입니다." };
  }
  const validFormId = parsedFormId.data;

  try {
    // 1. 양식 및 질문 정보 조회
    const form = await db.query.applicationForms.findFirst({
      where: eq(applicationForms.id, validFormId),
      with: {
        questions: {
          orderBy: (questions, { asc }) => [asc(questions.order)],
        },
      },
    });

    if (!form) throw new Error("양식을 찾을 수 없습니다.");

    // 2. 제출 내역 및 답변 조회
    const submissions = await db.query.applicationSubmissions.findMany({
      where: eq(applicationSubmissions.formId, validFormId),
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
    logServerError("application-submission/export-csv", error, { formId: validFormId });
    return { success: false, message: "데이터 추출 중 오류가 발생했습니다." };
  }
}

/**
 * 지원자 개인정보(제출된 지원서) 관리자 삭제
 *
 * 개인정보보호법 §36(정보 주체의 삭제 요구권) 대응:
 * 지원자로부터 "내 정보를 지워달라" 요청을 받았을 때 관리자가 직접 DB 콘솔에
 * 접근하지 않고 안전하게 삭제할 수 있는 표준 경로를 제공합니다.
 *
 * 삭제 범위:
 * - `applicationSubmissions` 마스터 행
 * - `applicationAnswers` 는 FK `onDelete: "cascade"` 로 자동 삭제
 * - (현재 스키마상 파일 첨부 컬럼이 없어 Blob 정리 대상 없음)
 *
 * 감사 로그 정책 — **PII 최소화**:
 * 이 액션 자체가 "정보 주체의 삭제 요구권"에 대응하는 경로이므로, 감사 로그에는
 * 지원자 이름/이메일 같은 평문 PII를 남기지 않습니다. 주 테이블에서 PII를 지웠는데
 * 로그(Vercel Logs)에 잔존하면 삭제 요청 자체의 목적이 훼손됩니다. 대신
 * `submissionId`/`formId` 로 다른 시스템의 활동을 역추적할 수 있도록 식별자만 남깁니다.
 * 삭제 관리자도 책임 추적에 필요한 `adminUserId` 만 남기고 `adminEmail` 은 제외합니다.
 *
 * 동시성 처리:
 * `delete(...).returning({...})` 로 실제 삭제된 행 수를 확인합니다. `select → delete`
 * 만 사용하면 두 관리자가 동시에 같은 행을 삭제할 때 두 번째 요청도 성공 로그가
 * 찍혀 감사 로그가 왜곡됩니다.
 */
export async function deleteApplicationSubmission(
  submissionId: string
): Promise<{ success: boolean; message: string }> {
  const session = await requireAdmin();

  const parsedId = z.uuid("잘못된 지원서 ID 입니다.").safeParse(submissionId);
  if (!parsedId.success) {
    return {
      success: false,
      message: parsedId.error.issues[0]?.message ?? "잘못된 요청입니다.",
    };
  }

  // 존재 검증 + 성공 후 재검증할 목록 경로용 formId 확보.
  // PII 컬럼(이름/이메일)은 로그 정책상 조회하지 않습니다.
  const target = await db.query.applicationSubmissions.findFirst({
    where: eq(applicationSubmissions.id, parsedId.data),
    columns: {
      id: true,
      formId: true,
    },
  });

  if (!target) {
    return { success: false, message: "지원서를 찾을 수 없습니다." };
  }

  try {
    // returning 으로 실제 삭제된 행 확인 → 동시 삭제 시 감사 로그 왜곡 방지
    const deleted = await db
      .delete(applicationSubmissions)
      .where(eq(applicationSubmissions.id, parsedId.data))
      .returning({ id: applicationSubmissions.id });

    if (deleted.length === 0) {
      // 다른 세션이 이미 지운 경우 — 이 트랜잭션은 삭제자가 아니므로 감사 로그를 남기지 않는다
      return { success: false, message: "지원서를 찾을 수 없습니다." };
    }

    console.info(
      "[audit][application-submission-deleted]",
      JSON.stringify({
        adminUserId: session.user.id,
        submissionId: target.id,
        formId: target.formId,
        deletedAt: new Date().toISOString(),
      })
    );

    revalidatePath(`/admin/application-forms/${target.formId}/submissions`);
    return { success: true, message: "지원서가 삭제되었습니다." };
  } catch (error) {
    // 실패 로그도 동일 정책 — PII 제외, 식별자와 관리자 id 만 남긴다
    logServerError("application-submission/delete", error, {
      submissionId: parsedId.data,
      formId: target.formId,
      adminUserId: session.user.id,
    });
    return { success: false, message: "삭제 중 오류가 발생했습니다." };
  }
}

/**
 * 지원서 처리 상태 변경 (관리자 승인/거절/재검토)
 *
 * 신식 지원 시스템의 `status` 컬럼(PENDING/ACCEPTED/REJECTED)을 갱신하는 유일한 서버 액션.
 * 관리자 승인/거절의 표준 경로이며, 결정 이력을 감사 로그로 남긴다.
 *
 * 감사 로그 정책 — **PII 최소화** (`deleteApplicationSubmission` 정책과 동일):
 * 지원자의 합격/불합격 결정은 개인 이해관계에 직접 영향을 주는 관리 행위이므로 감사 대상.
 * 다만 로그에는 식별자(submissionId, formId, adminUserId)와 상태 전이(oldStatus → newStatus)
 * 만 남기고, 지원자 이름/이메일 등 평문 PII 는 남기지 않는다. 지원자 개인정보 삭제 요청 시
 * 감사 로그가 잔존하면 삭제 목적이 훼손되므로 최소 정보 원칙을 지킨다.
 *
 * 동시성 처리 — **단일 SQL CTE 로 상태 전이 원자화** (write-skew 방지):
 * neon-http 드라이버는 `db.transaction()` 을 지원하지 않는다 (`src/lib/db/reorder.ts:5`).
 * `select oldStatus → update` 를 두 문장으로 나누면 다음 race 가 발생한다:
 *   A: `PENDING` 을 읽음
 *   B: `ACCEPTED` 로 갱신 후 커밋
 *   A: `REJECTED` 로 갱신 성공 → 감사 로그는 `PENDING → REJECTED` 로 남지만
 *      실제 DB 전이는 `ACCEPTED → REJECTED` 였음
 * 이 왜곡을 막기 위해 CTE 를 사용한다:
 *   1) `before` CTE 가 `FOR UPDATE` 로 행을 잠그고 oldStatus 를 캡처
 *      (EvalPlanQual 로 최신 커밋 값을 재조회하여 stale snapshot 을 회피)
 *   2) `updated` CTE 가 UPDATE 를 수행하고 newStatus 를 RETURNING
 *   3) 최종 SELECT 가 둘을 조인해 (oldStatus, newStatus) 를 한 문장에서 반환
 * Postgres 는 단일 statement 를 statement-level atomic 으로 보장하므로 두 CTE 사이에 다른
 * 세션이 끼어들 수 없고, `FOR UPDATE` 가 concurrent update 를 직렬화한다.
 * (동일한 CTE + FOR UPDATE 패턴은 `src/features/users/actions/index.ts:107` 에서
 *  마지막 ADMIN 소실 방지를 위한 write-skew 방지에 이미 사용된다.)
 */
export async function updateSubmissionStatus(
  submissionId: string,
  newStatus: "PENDING" | "ACCEPTED" | "REJECTED"
): Promise<{ success: boolean; message: string }> {
  const session = await requireAdmin();

  const parsedId = z.uuid("잘못된 지원서 ID 입니다.").safeParse(submissionId);
  if (!parsedId.success) {
    return {
      success: false,
      message: parsedId.error.issues[0]?.message ?? "잘못된 요청입니다.",
    };
  }

  const parsedStatus = z
    .enum(["PENDING", "ACCEPTED", "REJECTED"])
    .safeParse(newStatus);
  if (!parsedStatus.success) {
    return { success: false, message: "잘못된 상태 값입니다." };
  }

  try {
    const result = await db.execute<{
      id: string;
      form_id: string;
      old_status: "PENDING" | "ACCEPTED" | "REJECTED";
      new_status: "PENDING" | "ACCEPTED" | "REJECTED";
    }>(sql`
      WITH before AS (
        SELECT id, form_id, status AS old_status
        FROM ${applicationSubmissions}
        WHERE id = ${parsedId.data}::uuid
        FOR UPDATE
      ),
      updated AS (
        UPDATE ${applicationSubmissions}
        SET status = ${parsedStatus.data}::application_status
        WHERE id IN (SELECT id FROM before)
        RETURNING id, form_id, status AS new_status
      )
      SELECT updated.id, updated.form_id, before.old_status, updated.new_status
      FROM updated
      JOIN before ON before.id = updated.id
    `);

    const rows = result.rows;
    if (rows.length === 0) {
      // 다른 세션이 이미 삭제한 경우 — 전이가 발생하지 않았으므로 감사 로그를 남기지 않는다
      return { success: false, message: "지원서를 찾을 수 없습니다." };
    }

    const [
      {
        id: updatedId,
        form_id: formId,
        old_status: oldStatus,
        new_status: newStatusValue,
      },
    ] = rows;

    console.info(
      "[audit][application-submission-status-changed]",
      JSON.stringify({
        adminUserId: session.user.id,
        submissionId: updatedId,
        formId,
        oldStatus,
        newStatus: newStatusValue,
        changedAt: new Date().toISOString(),
      })
    );

    revalidatePath(`/admin/application-forms/${formId}/submissions`);
    revalidatePath(
      `/admin/application-forms/${formId}/submissions/${updatedId}`
    );

    return { success: true, message: "지원서 상태가 변경되었습니다." };
  } catch (error) {
    logServerError("application-submission/status-change", error, {
      submissionId: parsedId.data,
      adminUserId: session.user.id,
    });
    return { success: false, message: "상태 변경 중 오류가 발생했습니다." };
  }
}
