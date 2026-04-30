/**
 * 모집(기수) 관리 서버 액션 파일
 * 
 * 역할: 관리자가 새로운 기수(모집)를 만들고, 수정하고, 삭제할 수 있게 해주는 파일입니다.
 * 예: 2025학년도 1기 모집을 만들고, 모집 기간을 정하고, 마감하는 작업들이 여기서 일어납니다.
 * 
 * "use server" 표기: 이 파일의 모든 함수는 서버에서만 실행되므로, 비밀 정보(DB 접근)를 안전하게 다룰 수 있습니다.
 */
"use server";

import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { deleteBlobIfExists } from "@/lib/blob-utils";
import { db } from "@/lib/db";
import { cohorts } from "@/lib/db/schema";

/**
 * 모집 상태를 정의하는 스키마
 * - UPCOMING: 아직 모집하지 않음 (예정 중)
 * - OPEN: 현재 모집 중
 * - CLOSED: 모집 마감
 */
const statusSchema = z.enum(["UPCOMING", "OPEN", "CLOSED"]);

/**
 * 기수 정보 유효성 검사 스키마
 * 
 * Zod는 입력된 데이터가 정확한 형식인지 확인하는 도구입니다.
 * 예: "name"이 정말 텍스트인지? 길이가 100자 이하인지? 이런 것들을 체크합니다.
 * 
 * superRefine 부분: 단순 타입 체크를 넘어 "시작일이 종료일보다 늦으면 안 된다"는 
 * 논리적 규칙까지 확인합니다. (날짜 교차 검증)
 */
const cohortSchema = z
  .object({
    name: z.string().trim().min(1, "기수명을 입력해주세요.").max(100, "기수명은 100자 이하여야 합니다."),
    description: z
      .string()
      .trim()
      .max(5000, "설명은 5000자 이하여야 합니다.")
      .optional(),
    startDate: z.string().trim().optional(),
    endDate: z.string().trim().optional(),
    recruitmentStartDate: z.string().trim().optional(),
    recruitmentEndDate: z.string().trim().optional(),
    googleFormUrl: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || value.startsWith("https://"), {
        message: "구글폼 URL은 https://로 시작해야 합니다.",
      }),
    googleSheetId: z.string().trim().optional(),
    recruitmentStatus: statusSchema,
    isActive: z.boolean(),
    order: z.coerce
      .number({ message: "정렬 순서는 숫자여야 합니다." })
      .int("정렬 순서는 정수여야 합니다."),
  })
  .superRefine((data, ctx) => {
    const parseDateString = (value: string | undefined, path: string) => {
      if (!value) {
        return null;
      }

      const isDateInputFormat = /^\d{4}-\d{2}-\d{2}$/.test(value);
      if (!isDateInputFormat) {
        ctx.addIssue({
          code: "custom",
          message: "날짜 형식이 올바르지 않습니다.",
          path: [path],
        });
        return null;
      }

      const parsed = new Date(`${value}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({
          code: "custom",
          message: "유효한 날짜를 입력해주세요.",
          path: [path],
        });
        return null;
      }

      return parsed;
    };

    const startDate = parseDateString(data.startDate, "startDate");
    const endDate = parseDateString(data.endDate, "endDate");
    const recruitmentStartDate = parseDateString(data.recruitmentStartDate, "recruitmentStartDate");
    const recruitmentEndDate = parseDateString(data.recruitmentEndDate, "recruitmentEndDate");

    if (startDate && endDate && startDate > endDate) {
      ctx.addIssue({
        code: "custom",
        message: "기수 시작일은 종료일보다 늦을 수 없습니다.",
        path: ["endDate"],
      });
    }

    if (recruitmentStartDate && recruitmentEndDate && recruitmentStartDate > recruitmentEndDate) {
      ctx.addIssue({
        code: "custom",
        message: "모집 시작일은 모집 종료일보다 늦을 수 없습니다.",
        path: ["recruitmentEndDate"],
      });
    }
  });

export type CohortActionState = {
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

/**
 * 텍스트를 정리하는 헬퍼 함수
 * 역할: 사용자가 입력한 값 앞뒤의 공백을 제거하거나, 잘못된 형식이면 빈 문자열로 반환
 * 예: "  안녕하세요  " → "안녕하세요"
 */
function normalizeText(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

/**
 * 문자열을 Date 객체로 변환하거나 null 반환
 * 역할: "2025-03-24" 형식의 문자열을 날짜 객체로 변환하거나, 빈 값이면 null 반환
 * 예: "2025-03-24" → Date(2025, 3, 24) / "" → null
 */
function toDateOrNull(value: string | undefined) {
  if (!value) {
    return null;
  }
  return new Date(`${value}T00:00:00`);
}

/**
 * Zod 검증 에러를 필드별 에러로 변환하는 함수
 * 역할: 검증에 실패한 여러 오류를 "필드명: 에러 메시지" 형태로 정렬
 * 예: [{ path: ["name"], message: "필수 항목" }] → { name: "필수 항목" }
 */
function issuesToFieldErrors(issues: Array<{ path: PropertyKey[]; message: string }>) {
  const fieldErrors: Record<string, string> = {};

  for (const issue of issues) {
    const [field] = issue.path;
    if (typeof field === "string" && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }

  return fieldErrors;
}

/**
 * 폼 데이터를 기수 정보로 파싱하고 검증하는 함수
 * 역할: 사용자가 폼에 입력한 값들을 정리하고, cohortSchema로 검증
 * 예: FormData → { name: "1기", order: 1, ... } (또는 에러 반환)
 */
function parseCohortFormData(formData: FormData) {
  return cohortSchema.safeParse({
    name: normalizeText(formData.get("name")),
    description: normalizeText(formData.get("description")) || undefined,
    startDate: normalizeText(formData.get("startDate")) || undefined,
    endDate: normalizeText(formData.get("endDate")) || undefined,
    recruitmentStartDate: normalizeText(formData.get("recruitmentStartDate")) || undefined,
    recruitmentEndDate: normalizeText(formData.get("recruitmentEndDate")) || undefined,
    googleFormUrl: normalizeText(formData.get("googleFormUrl")) || undefined,
    googleSheetId: normalizeText(formData.get("googleSheetId")) || undefined,
    recruitmentStatus: normalizeText(formData.get("recruitmentStatus")),
    isActive: formData.get("isActive") === "on",
    order: normalizeText(formData.get("order")) || "0",
  });
}

function normalizeFileName(fileName: string) {
  const trimmed = fileName.trim();
  const sanitized = trimmed
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");

  return sanitized || "cohort-image";
}

async function uploadCohortImage(fileEntry: FormDataEntryValue | null) {
  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    return { imageUrl: null, error: null } as const;
  }

  if (!fileEntry.type.startsWith("image/")) {
    return { imageUrl: null, error: "이미지 파일만 업로드할 수 있습니다." } as const;
  }

  const maxFileSize = 4 * 1024 * 1024;
  if (fileEntry.size > maxFileSize) {
    return { imageUrl: null, error: "이미지 파일은 4MB 이하여야 합니다." } as const;
  }

  const safeFileName = `cohorts/${Date.now()}-${normalizeFileName(fileEntry.name)}`;
  const blob = await put(safeFileName, fileEntry, {
    access: "public",
  });

  return { imageUrl: blob.url, error: null } as const;
}

/**
 * 새로운 기수(모집) 생성 서버 액션
 * 역할: 관리자가 새로운 기수를 만들 때 호출되는 함수
 * 
 * 단계:
 * 1. 관리자 권한 확인 (requireAdmin)
 * 2. 입력 데이터 검증 (parseCohortFormData)
 * 3. 검증 통과 시 데이터베이스에 저장
 * 4. 페이지 새로고침 및 리다이렉트
 * 
 * 반환값: { success, message, fieldErrors? } 형태의 상태 정보
 */
export async function createCohort(formData: FormData): Promise<CohortActionState> {
  await requireAdmin();

  const parsed = parseCohortFormData(formData);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  const uploadedImage = await uploadCohortImage(formData.get("image"));
  if (uploadedImage.error) {
    return {
      success: false,
      message: uploadedImage.error,
      fieldErrors: { image: uploadedImage.error },
    };
  }

  await db.insert(cohorts).values({
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    startDate: toDateOrNull(parsed.data.startDate),
    endDate: toDateOrNull(parsed.data.endDate),
    recruitmentStartDate: toDateOrNull(parsed.data.recruitmentStartDate),
    recruitmentEndDate: toDateOrNull(parsed.data.recruitmentEndDate),
    googleFormUrl: parsed.data.googleFormUrl ?? null,
    googleSheetId: parsed.data.googleSheetId ?? null,
    recruitmentStatus: parsed.data.recruitmentStatus,
    isActive: parsed.data.isActive,
    order: parsed.data.order,
    imageUrl: uploadedImage.imageUrl,
  });

  revalidatePath("/admin/recruitment");
  revalidatePath("/cohorts");
  revalidatePath("/recruitment");
  redirect("/admin/recruitment");
}

/**
 * 기수 정보 수정 서버 액션
 * 역할: 관리자가 이미 만들어진 기수의 정보를 변경할 때 호출되는 함수
 * 
 * 단계:
 * 1. 기수 ID 유효성 확인
 * 2. 입력 데이터 검증
 * 3. 데이터베이스의 기수 정보 업데이트
 * 4. 페이지 새로고침 및 리다이렉트
 * 
 * 매개변수: id (기수의 고유 ID), formData (수정할 정보)
 */
export async function updateCohort(id: string, formData: FormData): Promise<CohortActionState> {
  await requireAdmin();

  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      message: "잘못된 기수 ID입니다.",
    };
  }

  const parsed = parseCohortFormData(formData);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  const [existingCohort] = await db
    .select({ imageUrl: cohorts.imageUrl })
    .from(cohorts)
    .where(eq(cohorts.id, parsedId.data))
    .limit(1);

  if (!existingCohort) {
    return {
      success: false,
      message: "기수를 찾을 수 없습니다.",
    };
  }

  const shouldRemoveImage = formData.get("removeImage") === "true";
  const uploadedImage = await uploadCohortImage(formData.get("image"));
  if (uploadedImage.error) {
    return {
      success: false,
      message: uploadedImage.error,
      fieldErrors: { image: uploadedImage.error },
    };
  }

  let nextImageUrl = existingCohort.imageUrl;

  let imageToDelete: string | null = null;

  if (uploadedImage.imageUrl) {
    nextImageUrl = uploadedImage.imageUrl;
    if (existingCohort.imageUrl) {
      imageToDelete = existingCohort.imageUrl;
    }
  } else if (shouldRemoveImage) {
    nextImageUrl = null;
    if (existingCohort.imageUrl) {
      imageToDelete = existingCohort.imageUrl;
    }
  }

  await db
    .update(cohorts)
    .set({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      startDate: toDateOrNull(parsed.data.startDate),
      endDate: toDateOrNull(parsed.data.endDate),
      recruitmentStartDate: toDateOrNull(parsed.data.recruitmentStartDate),
      recruitmentEndDate: toDateOrNull(parsed.data.recruitmentEndDate),
      googleFormUrl: parsed.data.googleFormUrl ?? null,
      googleSheetId: parsed.data.googleSheetId ?? null,
      recruitmentStatus: parsed.data.recruitmentStatus,
      isActive: parsed.data.isActive,
      order: parsed.data.order,
      imageUrl: nextImageUrl,
    })
    .where(eq(cohorts.id, parsedId.data));

  if (imageToDelete) {
    await deleteBlobIfExists(imageToDelete);
  }

  revalidatePath("/admin/recruitment");
  revalidatePath("/cohorts");
  revalidatePath("/recruitment");
  redirect("/admin/recruitment");
}

/**
 * 기수 삭제 서버 액션
 * 역할: 관리자가 기수를 데이터베이스에서 삭제할 때 호출되는 함수
 * 
 * 단계:
 * 1. 관리자 권한 확인
 * 2. 기수 ID 유효성 확인
 * 3. 데이터베이스에서 기수 삭제
 * 4. 페이지 새로고침
 * 
 * 매개변수: id (삭제할 기수의 고유 ID)
 */
export async function deleteCohort(id: string) {
  await requireAdmin();

  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return;
  }

  await db.delete(cohorts).where(eq(cohorts.id, parsedId.data));
  revalidatePath("/admin/recruitment");
  revalidatePath("/cohorts");
  revalidatePath("/recruitment");
}

/**
 * 모집 상태 변경 서버 액션
 * 역할: 관리자가 모집 상태를 "예정" → "모집중" → "마감"으로 변경할 때 호출
 * 
 * 상태 종류:
 * - UPCOMING: 아직 시작 전 (프로그램 소개만 보임)
 * - OPEN: 모집 중 (지원서 접수 가능)
 * - CLOSED: 모집 마감 (지원 불가)
 * 
 * 매개변수: id (기수의 고유 ID), status (변경할 모집 상태)
 */
export async function updateRecruitmentStatus(
  id: string,
  status: "UPCOMING" | "OPEN" | "CLOSED"
) {
  await requireAdmin();

  const parsedId = z.uuid().safeParse(id);
  const parsedStatus = statusSchema.safeParse(status);
  if (!parsedId.success || !parsedStatus.success) {
    return;
  }

  await db
    .update(cohorts)
    .set({ recruitmentStatus: parsedStatus.data })
    .where(eq(cohorts.id, parsedId.data));

  revalidatePath("/admin/recruitment");
  revalidatePath("/cohorts");
  revalidatePath("/recruitment");
}
