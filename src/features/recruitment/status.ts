/**
 * 모집안내 상태를 한국 날짜 기준으로 계산합니다.
 * 저장된 날짜와 현재 시각을 모두 Asia/Seoul 달력 날짜로 변환해 상태를 판정합니다.
 */
import { toKstDateInput } from "@/lib/date-time";

export type RecruitmentStatus = "UPCOMING" | "OPEN" | "CLOSED";

/** 서버와 브라우저의 로컬 시간대에 영향을 받지 않는 한국 달력 날짜입니다. */
export function getSeoulDateKey(now: Date): string {
  return toKstDateInput(now);
}

/** 저장된 관리자 입력 날짜를 한국 달력의 YYYY-MM-DD로 읽습니다. */
export function getStoredDateKey(value: Date | null): string | null {
  return value ? toKstDateInput(value) : null;
}

/** 종료일 당일까지 모집 중이며, 날짜가 없으면 자동으로 접수를 열지 않습니다. */
export function computeRecruitmentStatus(
  startDate: string | null,
  endDate: string | null,
  now: Date = new Date(),
): RecruitmentStatus {
  const today = getSeoulDateKey(now);
  if (endDate && today > endDate) return "CLOSED";
  if (startDate && today >= startDate) return "OPEN";
  return "UPCOMING";
}
