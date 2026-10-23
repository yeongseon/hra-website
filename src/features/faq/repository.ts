/**
 * FAQ의 PostgreSQL 접근을 소유하는 저장소입니다.
 * 공개·관리자 화면에 필요한 필드만 골라 반환하고, 순서 변경은 기존 단일 SQL 헬퍼를 유지합니다.
 */
import "server-only";

import { asc, eq, max } from "drizzle-orm";
import { db } from "@/lib/db";
import { reorderByCase } from "@/lib/db/reorder";
import { faqContact, faqItems } from "@/lib/db/schema";

export type FaqContactInput = {
  contactName: string;
  contactPhone: string;
  contactRole: string;
};

export type FaqPublicItem = {
  id: string;
  question: string;
  answer: string;
};

export type FaqAdminItem = FaqPublicItem & { order: number };
export type FaqItemInput = Pick<FaqPublicItem, "question" | "answer">;

/** 활성 연락처의 표시 필드만 읽어 클라이언트에 내부 행 정보를 보내지 않습니다. */
export async function getActiveContact(): Promise<FaqContactInput | null> {
  const [contact] = await db
    .select({
      contactRole: faqContact.contactRole,
      contactName: faqContact.contactName,
      contactPhone: faqContact.contactPhone,
    })
    .from(faqContact)
    .where(eq(faqContact.isActive, true))
    .limit(1);

  return contact ?? null;
}

/** 기존 활성 연락처가 있으면 그 행을 고르는 현재 저장 정책을 유지합니다. */
export async function getActiveContactId(): Promise<string | null> {
  const [contact] = await db
    .select({ id: faqContact.id })
    .from(faqContact)
    .where(eq(faqContact.isActive, true))
    .limit(1);

  return contact?.id ?? null;
}

/** 최초 연락처는 기존과 같이 빈 기수명과 활성 상태로 생성합니다. */
export async function insertContact(input: FaqContactInput): Promise<void> {
  await db.insert(faqContact).values({ cohortName: "", ...input, isActive: true });
}

/** 이미 선택한 활성 연락처의 표시 필드만 갱신합니다. */
export async function updateContact(id: string, input: FaqContactInput): Promise<void> {
  await db.update(faqContact).set({ ...input, isActive: true }).where(eq(faqContact.id, id));
}

/** 공개 목록은 순서가 같은 항목을 생성 시각으로 안정적으로 정렬합니다. */
export async function listPublicItems(): Promise<FaqPublicItem[]> {
  return db
    .select({ id: faqItems.id, question: faqItems.question, answer: faqItems.answer })
    .from(faqItems)
    .orderBy(asc(faqItems.order), asc(faqItems.createdAt));
}

/** 관리자 정렬 UI에 필요한 순서 값만 공개 목록 필드에 더합니다. */
export async function listAdminItems(): Promise<FaqAdminItem[]> {
  return db
    .select({ id: faqItems.id, question: faqItems.question, answer: faqItems.answer, order: faqItems.order })
    .from(faqItems)
    .orderBy(asc(faqItems.order), asc(faqItems.createdAt));
}

/** 편집 화면은 해당 항목의 표시 필드만 읽습니다. */
export async function getItem(id: string): Promise<FaqPublicItem | null> {
  const [item] = await db
    .select({ id: faqItems.id, question: faqItems.question, answer: faqItems.answer })
    .from(faqItems)
    .where(eq(faqItems.id, id))
    .limit(1);

  return item ?? null;
}

/** 새 항목을 목록 끝에 놓기 위한 현재 최대 순서 값을 읽습니다. */
export async function getMaxOrder(): Promise<number | null> {
  const [{ maxOrder }] = await db.select({ maxOrder: max(faqItems.order) }).from(faqItems);
  return maxOrder;
}

/** 검증된 질문·답변과 service가 정한 순서만 저장합니다. */
export async function insertItem(input: FaqItemInput, order: number): Promise<void> {
  await db.insert(faqItems).values({ ...input, order });
}

/** 실제 갱신 결과로 누락 행과 조회 후 삭제 경합을 구분합니다. */
export async function updateItem(id: string, input: FaqItemInput): Promise<boolean> {
  const rows = await db.update(faqItems).set(input)
    .where(eq(faqItems.id, id)).returning({ id: faqItems.id });
  return rows.length > 0;
}

/** 삭제 대상이 없어도 기존처럼 오류 없이 종료합니다. */
export async function deleteItem(id: string): Promise<void> {
  await db.delete(faqItems).where(eq(faqItems.id, id));
}

/** 요청 순서 전체를 하나의 원자적 SQL로 갱신하고 실제 변경 건수를 반환합니다. */
export async function reorderItems(ids: readonly string[]): Promise<number> {
  const { affected } = await reorderByCase({
    table: faqItems,
    idColumn: faqItems.id,
    targetColumn: faqItems.order,
    assignments: ids.map((id, index) => ({ id, value: index + 1 })),
  });
  return affected;
}
