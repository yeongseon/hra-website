/** 운영 보고 CSV의 최소 필드·한국 시각·UTF-8 BOM·수식 주입 방어를 담당한다. */
import { formatKstCsvDateTime } from "@/lib/date-time";
import type { SubmissionStatusRow } from "./contracts";

// 공백·제어문자 뒤의 수식 시작 문자도 접두 작은따옴표로 무력화하고 모든 필드를 인용한다.
export function submissionCsvCell(value: string): string {
  const protectedValue = /^[\s\u0000-\u001f\u007f]*[=+\-@]/u.test(value) || /^[\t\r\n]/u.test(value) ? `'${value}` : value;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function renderSubmissionStatusesCsv(rows: SubmissionStatusRow[]): string {
  const records = [["이름", "제출 상태", "제출 시각(한국시간)"]];
  for (const row of rows) records.push([row.displayName, row.submittedAt ? "제출" : "미제출", row.submittedAt ? formatKstCsvDateTime(new Date(row.submittedAt)) : ""]);
  return "\uFEFF" + records.map(record => record.map(submissionCsvCell).join(",")).join("\r\n") + "\r\n";
}

// 경로·헤더 제어 문자와 과도한 길이를 제거한 이름을 RFC 5987로 제공한다.
export function submissionCsvDisposition(title: string): string {
  const name = [...title.replace(/[\x00-\x1f\x7f/\\"]/gu, "_").trim()].slice(0, 80).join("") || "과제";
  return `attachment; filename="assignment-submissions.csv"; filename*=UTF-8''${encodeURIComponent(`${name}-제출현황.csv`)}`;
}
