/**
 * 공개 교수진 목록의 PostgreSQL 조회를 소유합니다.
 * 관리자 표시 순서와 이름의 동점 정렬을 유지하고 화면에 필요한 열만 읽습니다.
 */
import "server-only";

import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { faculty } from "@/lib/db/schema";

export type PublicFacultyRow = {
  id: string;
  name: string;
  category: "CLASSICS" | "BUSINESS" | "LECTURE";
  currentPosition: string | null;
  formerPosition: string | null;
  imageUrl: string | null;
  order: number;
};

/** 관리자가 정한 순서가 같으면 이름 오름차순으로 공개 필드만 반환합니다. */
export async function listFacultyRows(): Promise<PublicFacultyRow[]> {
  return db
    .select({
      id: faculty.id,
      name: faculty.name,
      category: faculty.category,
      currentPosition: faculty.currentPosition,
      formerPosition: faculty.formerPosition,
      imageUrl: faculty.imageUrl,
      order: faculty.order,
    })
    .from(faculty)
    .orderBy(asc(faculty.order), asc(faculty.name));
}
