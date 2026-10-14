/**
 * 공개 페이지의 연·월·페이지 쿼리 파라미터를 검증합니다 (#124).
 * 잘못된 값은 현재 달 또는 첫 페이지로 대체하고, 마지막 페이지를 넘으면 끝으로 보정합니다.
 */
import { z } from "zod/v4";
import { getKstYearMonth } from "@/lib/date-time";

const yearSchema = z.coerce.number().int().min(1900).max(2100);
const monthSchema = z.coerce.number().int().min(1).max(12);
const pageSchema = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().safe());

export function parseCalendarMonth(year: unknown, month: unknown, now = new Date()) {
  const parsedYear = yearSchema.safeParse(year);
  const parsedMonth = monthSchema.safeParse(month);
  const current = getKstYearMonth(now);
  return {
    year: parsedYear.success ? parsedYear.data : current.year,
    month: parsedMonth.success ? parsedMonth.data : current.month,
  };
}

export function parseListPage(page: unknown, totalCount: number, pageSize: number) {
  const parsedPage = pageSchema.safeParse(page);
  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = Math.min(parsedPage.success ? parsedPage.data : 1, Math.max(totalPages, 1));
  return { currentPage, totalPages, startIndex: (currentPage - 1) * pageSize };
}
