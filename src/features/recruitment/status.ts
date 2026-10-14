/**
 * 모집안내 상태를 한국 날짜 기준으로 계산합니다.
 * 저장된 날짜는 관리자 입력값의 YYYY-MM-DD를 UTC 자정으로 기록하므로
 * 날짜 부분만 꺼내고, 현재 시각에만 Asia/Seoul 시간대를 적용합니다.
 */
export type RecruitmentStatus = "UPCOMING" | "OPEN" | "CLOSED";

const seoulDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 서버와 브라우저의 로컬 시간대에 영향을 받지 않는 한국 달력 날짜입니다. */
export function getSeoulDateKey(now: Date): string {
  const parts = new Map(seoulDateFormatter.formatToParts(now).map((part) => [part.type, part.value]));
  const year = parts.get("year");
  const month = parts.get("month");
  const day = parts.get("day");
  if (!year || !month || !day) {
    throw new Error("한국 날짜를 계산할 수 없습니다.");
  }
  return `${year}-${month}-${day}`;
}

/** DB의 UTC 자정에 저장된 관리자 입력 날짜를 다시 YYYY-MM-DD로 읽습니다. */
export function getStoredDateKey(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
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
