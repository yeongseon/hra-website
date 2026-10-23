/**
 * 공개 언론보도 게시판의 페이지 범위와 표시 필드 경계를 적용하는 Application Service입니다.
 * Web Page는 URL 입력을 넘기고 번호·날짜·외부 링크를 표시합니다.
 */
import "server-only";

import { parseListPage } from "@/lib/query-params";
import { countPressArticles, listPressArticleRows, type PublicPressArticleRow } from "./repository";

const pageSize = 15;

export type PublicPressArticle = PublicPressArticleRow;
export type PublicPressPage = {
  currentArticles: PublicPressArticle[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  startIndex: number;
};

/** 전체 건수로 요청 페이지를 보정하고 기존 정렬의 공개 기사만 반환합니다. */
export async function listPublicPressArticles(page: unknown): Promise<PublicPressPage> {
  const totalCount = await countPressArticles();
  const { currentPage, totalPages, startIndex } = parseListPage(page, totalCount, pageSize);
  const rows = await listPressArticleRows(pageSize, startIndex);
  return {
    currentArticles: rows.map((row) => ({
      id: row.id,
      title: row.title,
      source: row.source,
      url: row.url,
      publishedAt: row.publishedAt,
      viewCount: row.viewCount,
    })),
    totalCount,
    currentPage,
    totalPages,
    startIndex,
  };
}
