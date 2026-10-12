/**
 * Drizzle이 cause로 감싼 PostgreSQL 제약 오류를 판별합니다.
 * 사용자 응답에 원본 DB 오류를 노출하지 않고 알려진 충돌만 구분하는 용도입니다.
 */
export function isConstraintViolation(error: unknown, code: string, constraint: string): boolean {
  const seen = new Set<object>();
  let current = error;
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && current.code === code &&
        "constraint" in current && current.constraint === constraint) return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}
