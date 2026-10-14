/**
 * 한국 시간 기준 날짜·시각 표시와 날짜 입력값 변환 공통 헬퍼입니다 (#125).
 * 서버와 브라우저의 로컬 시간대가 달라도 같은 문자열을 반환합니다.
 */
const timeZone = "Asia/Seoul";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const minuteFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const secondFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function dateParts(value: Date) {
  const parts = new Map(secondFormatter.formatToParts(value).map((part) => [part.type, part.value]));
  const year = parts.get("year");
  const month = parts.get("month");
  const day = parts.get("day");
  const hour = parts.get("hour");
  const minute = parts.get("minute");
  const second = parts.get("second");
  if (!year || !month || !day || !hour || !minute || !second) {
    throw new Error("한국 날짜와 시각을 계산할 수 없습니다.");
  }
  return { year, month, day, hour, minute, second };
}

export function formatKstDate(value: Date | string): string {
  return dateFormatter.format(typeof value === "string" ? new Date(value) : value);
}

export function formatKstDateTime(value: Date): string {
  return minuteFormatter.format(value);
}

export function formatKstDateTimeWithSeconds(value: Date): string {
  return secondFormatter.format(value);
}

export function toKstDateInput(value: Date | null): string {
  if (!value) return "";
  const { year, month, day } = dateParts(value);
  return `${year}-${month}-${day}`;
}

export function getKstYearMonth(value: Date): { year: number; month: number } {
  const { year, month } = dateParts(value);
  return { year: Number(year), month: Number(month) };
}

export function formatKstCsvDateTime(value: Date): string {
  const { year, month, day, hour, minute, second } = dateParts(value);
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}
