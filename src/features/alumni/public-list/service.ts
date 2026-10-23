/**
 * 공개 수료생 이야기 목록의 페이지 보정과 표시 필드를 제공하는 Application Service입니다.
 * Page는 이미지 대체색·링크·카드 배치만 구성합니다.
 */
import "server-only";

import { parseListPage } from "@/lib/query-params";
import { countAlumniStories, listAlumniStoryRows, type PublicAlumniStoryRow } from "./repository";

const pageSize = 15;

export type PublicAlumniStory = PublicAlumniStoryRow;
export type PublicAlumniPage = {
  items: PublicAlumniStory[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  startIndex: number;
};

/** 전체 건수로 요청 페이지를 보정한 뒤 본문 없는 공개 목록만 반환합니다. */
export async function listPublicAlumniStories(page: unknown): Promise<PublicAlumniPage> {
  const totalCount = await countAlumniStories();
  const { currentPage, totalPages, startIndex } = parseListPage(page, totalCount, pageSize);
  const rows = await listAlumniStoryRows(pageSize, startIndex);
  return {
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      quote: row.quote,
      summary: row.summary,
      title: row.title,
      imageUrl: row.imageUrl,
    })),
    totalCount,
    currentPage,
    totalPages,
    startIndex,
  };
}
