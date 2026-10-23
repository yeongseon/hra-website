"use server";

/**
 * FAQ 웹 서버 액션입니다. FormData와 웹 세션을 검증해 FAQ 서비스에 전달하고,
 * 저장 후 경로 재검증·리다이렉트와 사용자에게 보여 줄 고정 결과만 처리합니다.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { logServerError } from "@/lib/errors";
import {
  createItem,
  deleteItem,
  getAdminContact,
  getAdminItem,
  listPublicItems,
  reorderItems,
  saveContact,
  updateItem,
} from "@/features/faq/service";

const faqContactSchema = z.object({
  contactName: z.string().trim().min(1, "담당자명을 입력해주세요.").max(100, "담당자명은 100자 이하여야 합니다."),
  contactPhone: z.string().trim().min(1, "연락처를 입력해주세요.").max(20, "연락처는 20자 이하여야 합니다."),
  contactRole: z.string().trim().min(1, "역할을 입력해주세요.").max(100, "역할은 100자 이하여야 합니다."),
});

export type FaqContactActionState = {
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

// 웹 세션을 FAQ 서비스의 관리자 주체로 바꾸고 모든 액션 진입에서 다시 인가합니다.
async function requireFaqActor() {
  const session = await requireAdmin();
  return { userId: session.user.id, role: session.user.role };
}

// 관리자 연락처 조회에서도 매 호출마다 웹 세션을 확인합니다.
export async function getFaqContact() {
  const actor = await requireFaqActor();
  const contact = await getAdminContact(actor);
  return contact ? {
    contactName: contact.contactName,
    contactPhone: contact.contactPhone,
    contactRole: contact.contactRole,
  } : null;
}

export async function updateFaqContact(formData: FormData): Promise<FaqContactActionState> {
  const actor = await requireFaqActor();

  const parsed = faqContactSchema.safeParse({
    contactName: normalizeText(formData.get("contactName")),
    contactPhone: normalizeText(formData.get("contactPhone")),
    contactRole: normalizeText(formData.get("contactRole")),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];

    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  await saveContact(actor, parsed.data);

  revalidatePath("/faq");
  revalidatePath("/admin/faq");

  return {
    success: true,
    message: "FAQ 연락처를 저장했습니다.",
  };
}

// ============================================================
// FAQ 질문·답변 CRUD
// ============================================================

// order 필드는 폼에서 제거 — 드래그앤드롭으로 순서 관리
const faqItemSchema = z.object({
  question: z.string().trim().min(1, "질문을 입력해주세요.").max(500, "질문은 500자 이하여야 합니다."),
  answer: z.string().trim().min(1, "답변을 입력해주세요."),
});

export type FaqItemActionState = {
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

// FAQ 항목 전체 조회 (공개·관리자 공용)
export async function getAllFaqItems() {
  const items = await listPublicItems();
  return items.map((item) => ({ id: item.id, question: item.question, answer: item.answer }));
}

// FAQ 항목 단건 조회 (관리자 편집용)
export async function getFaqItem(id: string) {
  const actor = await requireFaqActor();

  // Oracle Phase D BLOCK 수정 — z.uuid() 사전 검증으로 라우트 파라미터 leak 방지.
  // UUID 형식이 아닌 값이 DB 쿼리에 도달하면 Postgres cast error 로 raw ID 가
  // Vercel Logs 에 노출될 수 있으므로 사전 차단한다.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return null;

  const item = await getAdminItem(actor, parsedId.data);
  return item ? { id: item.id, question: item.question, answer: item.answer } : null;
}

// FAQ 항목 생성 — 순서는 기존 최댓값 + 1로 자동 지정 (새 항목은 목록 맨 아래로)
export async function createFaqItem(formData: FormData): Promise<FaqItemActionState> {
  const actor = await requireFaqActor();

  const parsed = faqItemSchema.safeParse({
    question: formData.get("question"),
    answer: formData.get("answer"),
  });

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
      fieldErrors: Object.fromEntries(
        parsed.error.issues
          .filter((i) => i.path.length > 0)
          .map((i) => [String(i.path[0]), i.message])
      ),
    };
  }

  await createItem(actor, parsed.data);
  revalidatePath("/faq");
  revalidatePath("/admin/faq");
  redirect("/admin/faq");
}

// FAQ 항목 수정 — 순서(order)는 드래그앤드롭으로 관리하므로 수정하지 않음
export async function updateFaqItem(id: string, formData: FormData): Promise<FaqItemActionState> {
  const actor = await requireFaqActor();

  // Oracle Phase D BLOCK 수정 — z.uuid() 사전 검증으로 라우트 파라미터 leak 방지.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return { success: false, message: "유효하지 않은 ID입니다." };
  }

  const parsed = faqItemSchema.safeParse({
    question: formData.get("question"),
    answer: formData.get("answer"),
  });

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
      fieldErrors: Object.fromEntries(
        parsed.error.issues
          .filter((i) => i.path.length > 0)
          .map((i) => [String(i.path[0]), i.message])
      ),
    };
  }

  // 별도 존재 조회 대신 실제 저장 결과를 검사해 조회 후 삭제 경합도 처리합니다.
  if (!(await updateItem(actor, parsedId.data, parsed.data))) {
    return { success: false, message: "FAQ 항목을 찾을 수 없습니다." };
  }
  revalidatePath("/faq");
  revalidatePath("/admin/faq");
  redirect("/admin/faq");
}

// FAQ 항목 삭제
export async function deleteFaqItem(id: string): Promise<void> {
  const actor = await requireFaqActor();

  // Oracle Phase D BLOCK 수정 — z.uuid() 사전 검증으로 라우트 파라미터 leak 방지.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return;

  await deleteItem(actor, parsedId.data);
  revalidatePath("/faq");
  revalidatePath("/admin/faq");
}

// FAQ 항목 순서 일괄 변경 — 드래그앤드롭 결과를 저장
// orderedIds: 새 순서대로 정렬된 FAQ 항목 ID 배열
// 저장소의 단일 UPDATE ... CASE 문으로 원자적으로 갱신합니다.
// 개별 UPDATE 루프에서 중간 실패 시 정렬 상태가 뒤엉키지 않도록 합니다.
export async function reorderFaqItems(
  orderedIds: string[]
): Promise<{ success: boolean; message: string }> {
  const actor = await requireFaqActor();

  // Oracle Phase D 5라운드 BLOCK 수정 — orderedIds 각 원소를 UUID 로 사전 검증한다.
  // 이 배열은 reorderByCase 헬퍼의 `${a.id}::uuid` raw SQL 캐스트로 흘러가는데
  // UUID 형식이 아닌 값이 도달하면 Postgres cast error 로 raw ID 가 Vercel Logs 에
  // 노출될 수 있으므로 사전 차단한다. z.array(z.uuid()).min(1) 은 배열/비어있음/원소 형식을 한번에 검증.
  const parsedIds = z.array(z.uuid()).min(1).safeParse(orderedIds);
  if (!parsedIds.success) {
    return { success: false, message: "유효하지 않은 요청입니다." };
  }
  const validIds = parsedIds.data;

  try {
    const { matched, affected } = await reorderItems(actor, validIds);

    // 존재하지 않는 ID 또는 중복 ID 로 인해 일부만 갱신된 경우 방어
    if (!matched) {
      logServerError(
        "faq/reorder",
        new Error("update count mismatch"),
        {
          expected: validIds.length,
          actual: affected,
        },
      );
      return { success: false, message: "일부 항목을 저장하지 못했습니다." };
    }
  } catch (err) {
    logServerError("faq/reorder", err, {
      orderedIdsCount: validIds.length,
    });
    return { success: false, message: "순서를 저장하지 못했습니다. 다시 시도해주세요." };
  }

  revalidatePath("/faq");
  revalidatePath("/admin/faq");
  return { success: true, message: "순서를 저장했습니다." };
}
