/**
 * 강의자료 읽기 권한 필터.
 * 상세 화면과 메타데이터에서 동일한 SQL 조건을 사용하여 조회 단계에서 노출을 차단합니다.
 * 알 수 없는 역할·자료 대상은 허용하지 않으며, 공개 Blob 자체의 접근 정책은 별도입니다.
 */
import { inArray, sql } from "drizzle-orm";
import { classMaterials } from "@/lib/db/schema";

// 인증된 사용자 식별자와 역할을 함께 확인합니다. 역할 문자열만으로는 허용하지 않습니다.
export function classMaterialReadFilter(user?: { id?: string; role?: string } | null) {
  if (!user?.id) return sql`false`;

  if (user.role === "ADMIN" || user.role === "FACULTY") {
    return inArray(classMaterials.audience, ["STUDENT", "FACULTY"]);
  }
  if (user.role === "MEMBER") {
    return inArray(classMaterials.audience, ["STUDENT"]);
  }
  return sql`false`;
}
