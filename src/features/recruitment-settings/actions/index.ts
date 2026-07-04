"use server";

import { put } from "@vercel/blob";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { deleteBlobIfExists, isBlobUrl } from "@/lib/blob-utils";
import { db } from "@/lib/db";
import { cohorts, recruitmentSettings } from "@/lib/db/schema";

const maxPosterFileSize = 10 * 1024 * 1024;
const posterInputModeSchema = z.enum(["url", "file"]);

const dateStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "마감일 형식이 올바르지 않습니다.")
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00`).getTime()), {
    message: "유효한 마감일을 입력해주세요.",
  });

const recruitmentSettingsSchema = z
  .object({
    posterInputMode: posterInputModeSchema,
    posterImageUrl: z.string().trim().optional(),
    // 현재 모집 기수 섹션
    activeCohortId: z.union([z.uuid("올바른 기수를 선택해주세요."), z.literal("")]).optional(),
    googleFormUrl: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || v.startsWith("https://"), { message: "구글폼 URL은 https://로 시작해야 합니다." }),
    recruitmentStartDate: z.union([dateStringSchema, z.literal("")]).optional(),
    // 기존 모집 안내 섹션
    deadlineDate: z.union([dateStringSchema, z.literal("")]).optional(),
    detailsMarkdown: z.string().trim().max(20000, "세부 안내는 20000자 이하여야 합니다.").optional(),
    posterLayout: z.enum(["right", "left", "none"]).default("right"),
  })
  .superRefine((value, context) => {
    if (value.posterInputMode !== "url" || !value.posterImageUrl) {
      return;
    }

    if (!value.posterImageUrl.startsWith("http://") && !value.posterImageUrl.startsWith("https://")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["posterImageUrl"],
        message: "포스터 URL은 http:// 또는 https://로 시작해야 합니다.",
      });
    }
  });

export type RecruitmentSettingsActionState = {
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

function normalizeText(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function toDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function normalizePosterFileName(fileName: string) {
  return fileName.trim().replace(/\s+/g, "-");
}

function toWebpFileName(fileName: string) {
  // 마지막 확장자만 교체해 다중 점(.)이 포함된 파일명도 안전하게 처리한다.
  return fileName.replace(/\.[^./\\]+$/, "") + ".webp";
}

function validatePosterFile(fileEntry: FormDataEntryValue | null) {
  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    return {
      success: true as const,
      file: undefined,
    };
  }

  if (!fileEntry.type.startsWith("image/")) {
    return {
      success: false as const,
      message: "포스터 이미지는 이미지 파일만 업로드할 수 있습니다.",
      fieldErrors: { posterFile: "포스터 이미지는 이미지 파일만 업로드할 수 있습니다." },
    };
  }

  if (fileEntry.size > maxPosterFileSize) {
    return {
      success: false as const,
      message: "포스터 이미지는 10MB 이하만 업로드할 수 있습니다.",
      fieldErrors: { posterFile: "포스터 이미지는 10MB 이하만 업로드할 수 있습니다." },
    };
  }

  return {
    success: true as const,
    file: fileEntry,
  };
}

async function uploadPosterFile(file: File) {
  const originalBuffer = Buffer.from(await file.arrayBuffer());
  const safeFileName = normalizePosterFileName(file.name);

  try {
    const webpBuffer = await sharp(originalBuffer).webp({ quality: 85 }).toBuffer();
    const webpFileName = toWebpFileName(safeFileName);
    const blob = await put(`recruitment/포스터-${webpFileName}`, webpBuffer, {
      access: "public",
      contentType: "image/webp",
    });

    return blob.url;
  } catch {
    const blob = await put(`recruitment/포스터-${safeFileName}`, originalBuffer, {
      access: "public",
      contentType: file.type || undefined,
    });

    return blob.url;
  }
}

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

export async function getRecruitmentSettings() {
  await requireAdmin();

  const [settings] = await db.select().from(recruitmentSettings).limit(1);

  return settings ?? null;
}

export async function updateRecruitmentSettings(
  formData: FormData
): Promise<RecruitmentSettingsActionState> {
  await requireAdmin();

  const parsed = recruitmentSettingsSchema.safeParse({
    posterInputMode: normalizeText(formData.get("posterInputMode")),
    posterImageUrl: normalizeText(formData.get("posterImageUrl")) || undefined,
    activeCohortId: normalizeText(formData.get("activeCohortId")) || undefined,
    recruitmentStatus: normalizeText(formData.get("recruitmentStatus")) || undefined,
    googleFormUrl: normalizeText(formData.get("googleFormUrl")) || undefined,
    recruitmentStartDate: normalizeText(formData.get("recruitmentStartDate")) || undefined,
    deadlineDate: normalizeText(formData.get("deadlineDate")) || undefined,
    detailsMarkdown: normalizeText(formData.get("detailsMarkdown")) || undefined,
    posterLayout: normalizeText(formData.get("posterLayout")) || "right",
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];

    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  const removePoster = normalizeText(formData.get("removePoster")) === "true";
  const validatedPosterFile = validatePosterFile(formData.get("posterFile"));

  if (!validatedPosterFile.success) {
    return {
      success: false,
      message: validatedPosterFile.message,
      fieldErrors: validatedPosterFile.fieldErrors,
    };
  }

  const [existingSettings] = await db
    .select({
      id: recruitmentSettings.id,
      posterImageUrl: recruitmentSettings.posterImageUrl,
    })
    .from(recruitmentSettings)
    .limit(1);

  let nextPosterImageUrl: string | null = existingSettings?.posterImageUrl ?? null;
  // 이 요청에서 새로 업로드된 Blob URL 을 추적한다.
  // DB write 가 실패했을 때 새 Blob 은 아무 곳에서도 참조되지 않으므로 되지워 orphan 을 방지한다.
  let newlyUploadedBlobUrl: string | null = null;

  if (removePoster) {
    nextPosterImageUrl = null;
  } else if (parsed.data.posterInputMode === "file") {
    if (validatedPosterFile.file) {
      newlyUploadedBlobUrl = await uploadPosterFile(validatedPosterFile.file);
      nextPosterImageUrl = newlyUploadedBlobUrl;
    }
  } else {
    nextPosterImageUrl = parsed.data.posterImageUrl ?? null;
  }

  const values = {
    // 현재 모집 기수 섹션
    activeCohortId: parsed.data.activeCohortId || null,
    googleFormUrl: parsed.data.googleFormUrl ?? null,
    recruitmentStartDate: parsed.data.recruitmentStartDate ? toDate(parsed.data.recruitmentStartDate) : null,
    // 기존 모집 안내 섹션
    posterImageUrl: nextPosterImageUrl,
    deadlineDate: parsed.data.deadlineDate ? toDate(parsed.data.deadlineDate) : null,
    detailsMarkdown: parsed.data.detailsMarkdown ?? null,
    posterLayout: parsed.data.posterLayout,
  };

  // 순서 원칙 (data-integrity, #62): 새 Blob 업로드 완료 → DB write → 옛 Blob cleanup.
  // 옛 Blob 을 DB write 전에 지우면 write 실패 시 옛 이미지도 사라지고 새 참조도 저장되지 않아
  // 사용자 관점에서 데이터가 유실된다. write 성공을 확인한 뒤 옛 Blob 을 정리해야 한다.
  try {
    if (!existingSettings) {
      await db.insert(recruitmentSettings).values(values);
    } else {
      await db
        .update(recruitmentSettings)
        .set(values)
        .where(eq(recruitmentSettings.id, existingSettings.id));
    }
  } catch (dbError) {
    // DB write 가 실패하면 방금 업로드한 새 Blob 은 어떤 row 에서도 참조되지 않으므로 되지운다.
    // deleteBlobIfExists 는 내부에서 오류를 로그로만 남기므로 rethrow 하기 전에 안전하게 호출 가능하다.
    if (newlyUploadedBlobUrl) {
      await deleteBlobIfExists(newlyUploadedBlobUrl);
    }
    throw dbError;
  }

  // DB write 가 성공한 뒤에만 옛 Blob 을 지운다 (best-effort — 실패해도 이미 저장된 row 는 무결).
  // 원칙: previous 가 blob URL 이고 new 값과 다르면 삭제 (외부 URL 은 isBlobUrl 로 걸러짐).
  // - file → file (다른 파일): 이전 blob 삭제
  // - file → url (외부 URL 로 전환): 이전 blob 삭제
  // - file → 제거: 이전 blob 삭제
  // - url → 임의 (previous 가 외부 URL): isBlobUrl 이 false → 미삭제
  // - 변화 없음 (previous === next): 미삭제
  // ※ previous 가 blob URL 인데 admin 이 수동으로 *.vercel-storage.com URL 을 입력해 next 가
  //   다른 blob URL 이 된 경우에도 삭제가 발생한다 (이 역시 이전 blob 은 미참조 → orphan 이므로 의도된 동작).
  const previousPosterUrl = existingSettings?.posterImageUrl;
  if (
    previousPosterUrl &&
    isBlobUrl(previousPosterUrl) &&
    previousPosterUrl !== nextPosterImageUrl
  ) {
    await deleteBlobIfExists(previousPosterUrl);
  }

  revalidatePath("/recruitment");
  revalidatePath("/admin/recruitment-settings");

  return {
    success: true,
    message: "모집 설정을 저장했습니다.",
  };
}

// 기수 선택 드롭다운용 — 전체 기수 목록을 최신 순으로 반환
export async function getCohorts() {
  await requireAdmin();

  return db
    .select({ id: cohorts.id, name: cohorts.name })
    .from(cohorts)
    .orderBy(desc(cohorts.order), desc(cohorts.createdAt));
}

// ─── 섹션별 독립 저장 액션 ────────────────────────────────────────────────────

/**
 * 섹션 1: 현재 모집 정보 저장
 * 저장 대상: activeCohortId, googleFormUrl, recruitmentStartDate, deadlineDate
 */
export async function updateRecruitmentInfo(
  formData: FormData
): Promise<RecruitmentSettingsActionState> {
  await requireAdmin();

  const infoSchema = z.object({
    activeCohortId: z.union([z.uuid("올바른 기수를 선택해주세요."), z.literal("")]).optional(),
    googleFormUrl: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || v.startsWith("https://"), { message: "구글폼 URL은 https://로 시작해야 합니다." }),
    recruitmentStartDate: z.union([dateStringSchema, z.literal("")]).optional(),
    deadlineDate: z.union([dateStringSchema, z.literal("")]).optional(),
  });

  const parsed = infoSchema.safeParse({
    activeCohortId: normalizeText(formData.get("activeCohortId")) || undefined,
    googleFormUrl: normalizeText(formData.get("googleFormUrl")) || undefined,
    recruitmentStartDate: normalizeText(formData.get("recruitmentStartDate")) || undefined,
    deadlineDate: normalizeText(formData.get("deadlineDate")) || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  const values = {
    activeCohortId: parsed.data.activeCohortId || null,
    googleFormUrl: parsed.data.googleFormUrl ?? null,
    recruitmentStartDate: parsed.data.recruitmentStartDate ? toDate(parsed.data.recruitmentStartDate) : null,
    deadlineDate: parsed.data.deadlineDate ? toDate(parsed.data.deadlineDate) : null,
  };

  const [existing] = await db.select({ id: recruitmentSettings.id }).from(recruitmentSettings).limit(1);

  if (!existing) {
    await db.insert(recruitmentSettings).values(values);
  } else {
    await db.update(recruitmentSettings).set(values).where(eq(recruitmentSettings.id, existing.id));
  }

  revalidatePath("/recruitment");
  revalidatePath("/admin/recruitment-settings");

  return { success: true, message: "현재 모집 정보를 저장했습니다." };
}

/**
 * 섹션 2: 모집 포스터 저장
 * 저장 대상: posterImageUrl (파일 업로드 또는 URL), posterLayout
 */
export async function updateRecruitmentPoster(
  formData: FormData
): Promise<RecruitmentSettingsActionState> {
  await requireAdmin();

  const posterSchema = z.object({
    posterInputMode: posterInputModeSchema,
    posterImageUrl: z.string().trim().optional(),
    posterLayout: z.enum(["right", "left", "none"]).default("right"),
  }).superRefine((value, ctx) => {
    if (value.posterInputMode === "url" && value.posterImageUrl) {
      if (!value.posterImageUrl.startsWith("http://") && !value.posterImageUrl.startsWith("https://")) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["posterImageUrl"], message: "포스터 URL은 http:// 또는 https://로 시작해야 합니다." });
      }
    }
  });

  const parsed = posterSchema.safeParse({
    posterInputMode: normalizeText(formData.get("posterInputMode")) || "file",
    posterImageUrl: normalizeText(formData.get("posterImageUrl")) || undefined,
    posterLayout: normalizeText(formData.get("posterLayout")) || "right",
  });

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  const removePoster = normalizeText(formData.get("removePoster")) === "true";
  const validatedPosterFile = validatePosterFile(formData.get("posterFile"));

  if (!validatedPosterFile.success) {
    return { success: false, message: validatedPosterFile.message, fieldErrors: validatedPosterFile.fieldErrors };
  }

  const [existing] = await db
    .select({ id: recruitmentSettings.id, posterImageUrl: recruitmentSettings.posterImageUrl })
    .from(recruitmentSettings)
    .limit(1);

  let nextPosterImageUrl: string | null = existing?.posterImageUrl ?? null;
  // 이 요청에서 새로 업로드된 Blob URL 을 추적한다 (DB write 실패 시 되지워 orphan 을 방지).
  let newlyUploadedBlobUrl: string | null = null;

  if (removePoster) {
    nextPosterImageUrl = null;
  } else if (parsed.data.posterInputMode === "file") {
    if (validatedPosterFile.file) {
      newlyUploadedBlobUrl = await uploadPosterFile(validatedPosterFile.file);
      nextPosterImageUrl = newlyUploadedBlobUrl;
    }
  } else {
    nextPosterImageUrl = parsed.data.posterImageUrl ?? null;
  }

  const values = { posterImageUrl: nextPosterImageUrl, posterLayout: parsed.data.posterLayout };

  // 순서 원칙 (data-integrity, #62): 새 Blob 업로드 완료 → DB write → 옛 Blob cleanup.
  // 상세 근거는 updateRecruitmentSettings 의 동일 블록 주석 참고.
  try {
    if (!existing) {
      await db.insert(recruitmentSettings).values(values);
    } else {
      await db.update(recruitmentSettings).set(values).where(eq(recruitmentSettings.id, existing.id));
    }
  } catch (dbError) {
    // DB write 실패 시 새 Blob 은 미참조 → best-effort 로 되지운다.
    if (newlyUploadedBlobUrl) {
      await deleteBlobIfExists(newlyUploadedBlobUrl);
    }
    throw dbError;
  }

  // DB write 성공 후에만 옛 Blob 을 지운다 (best-effort — 실패해도 저장된 row 는 무결).
  // 케이스 분석은 updateRecruitmentSettings 의 동일 블록 주석 참고.
  const previousPosterUrl = existing?.posterImageUrl;
  if (
    previousPosterUrl &&
    isBlobUrl(previousPosterUrl) &&
    previousPosterUrl !== nextPosterImageUrl
  ) {
    await deleteBlobIfExists(previousPosterUrl);
  }

  revalidatePath("/recruitment");
  revalidatePath("/admin/recruitment-settings");

  return { success: true, message: "모집 포스터를 저장했습니다." };
}

/**
 * 섹션 3: 모집 세부 안내 저장
 * 저장 대상: detailsMarkdown
 */
export async function updateRecruitmentDetails(
  formData: FormData
): Promise<RecruitmentSettingsActionState> {
  await requireAdmin();

  const detailsSchema = z.object({
    detailsMarkdown: z.string().trim().max(20000, "세부 안내는 20000자 이하여야 합니다.").optional(),
  });

  const parsed = detailsSchema.safeParse({
    detailsMarkdown: normalizeText(formData.get("detailsMarkdown")) || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  const values = { detailsMarkdown: parsed.data.detailsMarkdown ?? null };

  const [existing] = await db.select({ id: recruitmentSettings.id }).from(recruitmentSettings).limit(1);

  if (!existing) {
    await db.insert(recruitmentSettings).values(values);
  } else {
    await db.update(recruitmentSettings).set(values).where(eq(recruitmentSettings.id, existing.id));
  }

  revalidatePath("/recruitment");
  revalidatePath("/admin/recruitment-settings");

  return { success: true, message: "모집 세부 안내를 저장했습니다." };
}
