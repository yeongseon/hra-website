/**
 * 지원서 체크박스 답변만 JSON 배열로 해석합니다.
 * 자유 입력 답변은 JSON처럼 보이는 문자열도 작성자가 입력한 그대로 보존합니다.
 */
export function parseCheckboxAnswerValue(
  rawValue: string,
  questionType: string | null | undefined,
): string[] | null {
  if (questionType !== "CHECKBOX") return null;

  try {
    const parsed: unknown = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed.map((value) => String(value)) : null;
  } catch {
    return null;
  }
}
