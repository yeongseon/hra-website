/** 서버 응답의 요청 참조 필드만 표시하기 위한 작은 검증기입니다. 폼·오류 메시지의 대체 ID를 받지 않습니다. */
export function readAcademicRequestReference(value: unknown): string | undefined {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase() : undefined;
}
