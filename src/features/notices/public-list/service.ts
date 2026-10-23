/**
 * 공개 공지 목록의 게시 정책과 페이지 경계를 적용하는 Application Service입니다.
 * Web 페이지는 검색 입력과 표현을 맡고, 이 서비스는 같은 조회 규칙을 재사용할 수 있게 합니다.
 */
import "server-only";

import { parseListPage } from "@/lib/query-params";
import { countNotices, listNotices, type NoticeSummary } from "./repository";

const pageSize = 15;

export type PublishedNoticePage = {
  items: readonly NoticeSummary[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  startIndex: number;
};

/** 게시된 공지만 세고, 기존 공개 페이지의 마지막 페이지 보정 후 목록을 읽습니다. */
export async function listPublishedNotices(input: {
  query: string;
  page: unknown;
}): Promise<PublishedNoticePage> {
  if (!input || typeof input.query !== "string") {
    throw new Error("NOTICE_LIST_INPUT_INVALID");
  }

  const query = input.query.trim();
  const totalCount = await countNotices("PUBLISHED", query);
  // Web 쿼리는 문자열이고 향후 API 계약은 숫자이므로 안전한 정수도 같은 페이지 값으로 해석합니다.
  const requestedPage = typeof input.page === "number" && Number.isSafeInteger(input.page)
    ? String(input.page)
    : input.page;
  const { currentPage, totalPages, startIndex } = parseListPage(requestedPage, totalCount, pageSize);
  const items = await listNotices("PUBLISHED", query, pageSize, startIndex);

  return { items, totalCount, currentPage, totalPages, startIndex };
}
