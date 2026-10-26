/**
 * 승인 회원용 가이드북 상세의 Application Service입니다.
 * 웹 어댑터가 검증한 세션 역할과 엄격한 UUID를 확인한 뒤 뷰어 표시 DTO만 반환합니다.
 */
import "server-only";

import { z } from "zod/v4";
import { canReadSharedResource } from "@/features/resources/access";
import { findGuidebookForViewer } from "./repository";

/** 파일 위치를 포함하지 않는 뷰어 표시 계약입니다. 다운로드는 기존 보호 경로를 사용합니다. */
export type MemberGuidebookDetail = { id: string; title: string; fileName: string };

/** 세션 검증은 호출 어댑터가 담당하고, 거부·잘못된 입력·없는 자료는 표시 결과를 만들지 않습니다. */
export async function getGuidebookForReader(input: {
  id: string;
  readerRole: string | null | undefined;
}): Promise<MemberGuidebookDetail | null> {
  if (!canReadSharedResource(input.readerRole)) return null;
  const parsedId = z.uuid().safeParse(input.id);
  if (!parsedId.success) return null;

  const book = await findGuidebookForViewer(parsedId.data);
  if (!book) return null;
  return { id: book.id, title: book.title, fileName: book.fileName };
}
