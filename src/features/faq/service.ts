/**
 * FAQ의 공개 조회와 관리자 업무 규칙을 제공하는 Application Service입니다.
 * Web 세션·FormData·캐시/이동은 호출자가 처리하고, 이 계층은 저장소의 결과만 사용합니다.
 */
import "server-only";

import * as faqRepository from "./repository";
import type { FaqAdminItem, FaqContactInput, FaqItemInput, FaqPublicItem } from "./repository";

export type { FaqAdminItem, FaqContactInput, FaqItemInput, FaqPublicItem } from "./repository";

export type FaqActor = { userId: string; role: string };

/** 다른 adapter가 서비스를 호출해도 홈페이지 관리자 권한을 다시 확인합니다. */
function assertAdmin(actor: FaqActor): void {
  if (!actor || actor.role !== "ADMIN" || typeof actor.userId !== "string" || !actor.userId) {
    throw new Error("FAQ_ADMIN_REQUIRED");
  }
}

/** 공개 화면에는 활성 연락처의 표시 필드만 제공합니다. */
export async function getPublicContact(): Promise<FaqContactInput | null> {
  return faqRepository.getActiveContact();
}

/** 공개 화면에는 ID·질문·답변만 제공합니다. */
export async function listPublicItems(): Promise<FaqPublicItem[]> {
  return faqRepository.listPublicItems();
}

/** 관리자 연락처 조회에도 같은 역할 검사를 적용합니다. */
export async function getAdminContact(actor: FaqActor): Promise<FaqContactInput | null> {
  assertAdmin(actor);
  return faqRepository.getActiveContact();
}

/** 현재 활성 연락처가 있으면 수정하고 없으면 기존 기본값으로 처음 생성합니다. */
export async function saveContact(actor: FaqActor, input: FaqContactInput): Promise<void> {
  assertAdmin(actor);
  const activeId = await faqRepository.getActiveContactId();
  if (activeId === null) {
    await faqRepository.insertContact(input);
  } else {
    await faqRepository.updateContact(activeId, input);
  }
}

/** 관리자 정렬 화면에 순서 값을 포함한 항목만 제공합니다. */
export async function listAdminItems(actor: FaqActor): Promise<FaqAdminItem[]> {
  assertAdmin(actor);
  return faqRepository.listAdminItems();
}

/** 편집 대상 항목을 조회하며, 없으면 null을 반환합니다. */
export async function getAdminItem(actor: FaqActor, id: string): Promise<FaqPublicItem | null> {
  assertAdmin(actor);
  return faqRepository.getItem(id);
}

/** 새 항목의 순서를 현재 최댓값 다음으로 정합니다. */
export async function createItem(actor: FaqActor, input: FaqItemInput): Promise<void> {
  assertAdmin(actor);
  const nextOrder = (await faqRepository.getMaxOrder() ?? 0) + 1;
  await faqRepository.insertItem(input, nextOrder);
}

/** 실제 변경된 행이 없으면 누락 항목으로 보고합니다. */
export async function updateItem(actor: FaqActor, id: string, input: FaqItemInput): Promise<boolean> {
  assertAdmin(actor);
  return faqRepository.updateItem(id, input);
}

/** 삭제 대상이 없어도 기존 관리자 명령처럼 멱등하게 종료합니다. */
export async function deleteItem(actor: FaqActor, id: string): Promise<void> {
  assertAdmin(actor);
  await faqRepository.deleteItem(id);
}

/** 단일 원자 SQL의 변경 건수가 요청 건수와 같은지 판단합니다. */
export async function reorderItems(
  actor: FaqActor,
  ids: readonly string[],
): Promise<{ matched: boolean; affected: number }> {
  assertAdmin(actor);
  const affected = await faqRepository.reorderItems(ids);
  return { matched: affected === ids.length, affected };
}
