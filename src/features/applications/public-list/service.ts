/**
 * 공개 지원 양식 목록의 Application Service입니다.
 * Web Page와 향후 API가 같은 발행 정책을 사용하도록 저장소 행을 표시 DTO로 분리합니다.
 */
import "server-only";

import { findPublishedApplicationFormRows } from "./repository";

/** 카드에 실제로 표시하는 필드만 공개 결과에 포함합니다. */
export type PublicApplicationFormListItem = {
  id: string;
  title: string;
  description: string | null;
};

/** 발행된 전체 양식을 기존 작성일 역순으로 반환하며 DB 오류는 상위 경계로 전달합니다. */
export async function listPublishedApplicationForms(): Promise<readonly PublicApplicationFormListItem[]> {
  const rows = await findPublishedApplicationFormRows();
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
  }));
}
