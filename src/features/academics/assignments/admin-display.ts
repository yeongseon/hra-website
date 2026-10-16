/** 과제 관리 화면에서 공유하는 한국어 상태와 한국시간 표시다. 브라우저 현지 시간대에 의존하지 않는다. */
export const assignmentStatusLabels = { DRAFT: "초안", PUBLISHED: "공개", CLOSED: "종료" } as const;

export function formatAssignmentKst(value: string | null): string {
  if (!value) return "마감 미정";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date(value));
}

/** datetime-local의 값은 한국시간 벽시계로 채우고 UTC 접미사를 넣지 않는다. */
export function assignmentKstInput(value: string | null): string {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (name: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === name)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

export const sessionCategoryLabels: Record<string, string> = {
  CLASSICS: "고전명작", ENGLISH: "영어", SPEECH: "스피치", SPECIAL_LECTURE: "특강", CASE_STUDY: "케이스스터디",
};
