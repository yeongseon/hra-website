/**
 * 공개 교수진 목록을 Page에 제공하는 Application Service입니다.
 * 저장소 구현이 바뀌어도 표시용 필드만 Page 경계로 전달합니다.
 */
import "server-only";

import { listFacultyRows, type PublicFacultyRow } from "./repository";

export type PublicFaculty = PublicFacultyRow;

/** 교수진 공개 표시 필드만 새 객체로 투영해 반환합니다. */
export async function listPublicFaculty(): Promise<PublicFaculty[]> {
  const rows = await listFacultyRows();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    currentPosition: row.currentPosition,
    formerPosition: row.formerPosition,
    imageUrl: row.imageUrl,
    order: row.order,
  }));
}
