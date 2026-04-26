/**
 * 보고서 양식·작성 가이드 서버 액션
 *
 * 역할: 관리자 페이지(/admin/templates)에서 보고서 양식과 작성 가이드(Markdown)
 *       문서의 CRUD를 처리한다. 본문은 DB에 저장되며, 회원 페이지에서 동일 데이터를 읽는다.
 *
 * 사용 위치:
 *   - src/app/(admin)/admin/templates/_components/template-form.tsx (생성/수정 폼)
 *   - src/app/(admin)/admin/templates/_components/template-row-actions.tsx (삭제)
 *
 * 보안:
 *   - 모든 진입점에서 requireAdmin()으로 관리자 권한 확인
 *   - slug 중복 검사 (DB unique 제약 + 사전 검증)
 *   - body는 Markdown 원문 그대로 저장하고, 렌더링 시점에 sanitize한다.
 */
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { reportTemplates } from "@/lib/db/schema";

// 폼 입력 검증 스키마
// slug: 영숫자/대시/언더스코어만 허용하여 URL 안정성 확보
const templateFormSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1, "슬러그를 입력해주세요.")
      .max(200, "슬러그는 200자 이하여야 합니다.")
      .regex(/^[a-z0-9-_]+$/i, "슬러그는 영문/숫자/-/_만 사용할 수 있습니다."),
    title: z
      .string()
      .trim()
      .min(1, "제목을 입력해주세요.")
      .max(300, "제목은 300자 이하여야 합니다."),
    category: z.enum(["template", "guide"]),
    reportCategory: z
      .enum(["management-book", "classic-book", "business-practice", ""])
      .optional()
      .transform((value) => (value === "" ? null : (value ?? null))),
    description: z
      .string()
      .trim()
      .max(500, "설명은 500자 이하여야 합니다.")
      .optional()
      .transform((value) => (value && value.length > 0 ? value : null)),
    version: z
      .string()
      .trim()
      .min(1, "버전을 입력해주세요.")
      .max(20, "버전은 20자 이하여야 합니다."),
    body: z.string().trim().min(1, "본문을 입력해주세요."),
    published: z.boolean(),
    order: z.number().int().min(0).max(9999),
  })
  .refine(
    (value) => value.category !== "template" || value.reportCategory !== null,
    {
      message: "양식(template) 카테고리는 분야 코드를 선택해야 합니다.",
      path: ["reportCategory"],
    },
  );

export type TemplateActionState = {
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

const idSchema = z.uuid("유효하지 않은 ID입니다.");

function normalizeText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseBoolean(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return false;
  return value === "on" || value === "true";
}

function parseInteger(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function issuesToFieldErrors(
  issues: Array<{ path: PropertyKey[]; message: string }>,
) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const [field] = issue.path;
    if (typeof field === "string" && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}

function parseFormData(formData: FormData) {
  return templateFormSchema.safeParse({
    slug: normalizeText(formData.get("slug")),
    title: normalizeText(formData.get("title")),
    category: normalizeText(formData.get("category")),
    reportCategory: normalizeText(formData.get("reportCategory")),
    description: normalizeText(formData.get("description")),
    version: normalizeText(formData.get("version")) || "1.0.0",
    body: typeof formData.get("body") === "string"
      ? (formData.get("body") as string)
      : "",
    published: parseBoolean(formData.get("published")),
    order: parseInteger(formData.get("order")),
  });
}

function revalidateTemplatePaths(slug?: string) {
  revalidatePath("/admin/templates");
  revalidatePath("/member/templates");
  revalidatePath("/member/guides");
  revalidatePath("/resources");
  if (slug) {
    revalidatePath(`/member/templates/${slug}`);
    revalidatePath(`/member/guides/${slug}`);
  }
}

export async function createReportTemplate(
  formData: FormData,
): Promise<TemplateActionState> {
  await requireAdmin();

  const parsed = parseFormData(formData);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  // 슬러그 중복 사전 검증 — DB unique 제약과 함께 이중으로 보호
  const duplicate = await db.query.reportTemplates.findFirst({
    where: eq(reportTemplates.slug, parsed.data.slug),
  });
  if (duplicate) {
    return {
      success: false,
      message: "이미 사용 중인 슬러그입니다.",
      fieldErrors: { slug: "이미 사용 중인 슬러그입니다." },
    };
  }

  try {
    await db.insert(reportTemplates).values({
      slug: parsed.data.slug,
      title: parsed.data.title,
      category: parsed.data.category,
      reportCategory: parsed.data.reportCategory,
      description: parsed.data.description,
      version: parsed.data.version,
      body: parsed.data.body,
      published: parsed.data.published,
      order: parsed.data.order,
    });
  } catch (error) {
    console.error("[report-templates/create] 생성 오류:", error);
    return {
      success: false,
      message: "양식 저장에 실패했습니다.",
    };
  }

  revalidateTemplatePaths(parsed.data.slug);
  redirect("/admin/templates");
}

export async function updateReportTemplate(
  id: string,
  formData: FormData,
): Promise<TemplateActionState> {
  await requireAdmin();

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      message: parsedId.error.issues[0]?.message ?? "유효하지 않은 ID입니다.",
    };
  }

  const parsed = parseFormData(formData);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  // 슬러그 변경 시 중복 검증 (자기 자신 제외)
  const existing = await db.query.reportTemplates.findFirst({
    where: eq(reportTemplates.slug, parsed.data.slug),
  });
  if (existing && existing.id !== parsedId.data) {
    return {
      success: false,
      message: "이미 사용 중인 슬러그입니다.",
      fieldErrors: { slug: "이미 사용 중인 슬러그입니다." },
    };
  }

  try {
    await db
      .update(reportTemplates)
      .set({
        slug: parsed.data.slug,
        title: parsed.data.title,
        category: parsed.data.category,
        reportCategory: parsed.data.reportCategory,
        description: parsed.data.description,
        version: parsed.data.version,
        body: parsed.data.body,
        published: parsed.data.published,
        order: parsed.data.order,
      })
      .where(eq(reportTemplates.id, parsedId.data));
  } catch (error) {
    console.error("[report-templates/update] 수정 오류:", error);
    return {
      success: false,
      message: "양식 수정에 실패했습니다.",
    };
  }

  revalidateTemplatePaths(parsed.data.slug);
  redirect("/admin/templates");
}

export async function deleteReportTemplate(
  id: string,
): Promise<TemplateActionState> {
  await requireAdmin();

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      message: parsedId.error.issues[0]?.message ?? "유효하지 않은 ID입니다.",
    };
  }

  try {
    const target = await db.query.reportTemplates.findFirst({
      where: eq(reportTemplates.id, parsedId.data),
    });
    if (!target) {
      return { success: false, message: "양식을 찾을 수 없습니다." };
    }

    await db
      .delete(reportTemplates)
      .where(eq(reportTemplates.id, parsedId.data));

    revalidateTemplatePaths(target.slug);
    return { success: true, message: "삭제되었습니다." };
  } catch (error) {
    console.error("[report-templates/delete] 삭제 오류:", error);
    return {
      success: false,
      message: "양식 삭제에 실패했습니다.",
    };
  }
}
