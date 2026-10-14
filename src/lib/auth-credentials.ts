/**
 * 관리자 이메일 로그인 대상 조회입니다.
 * 입력 대소문자와 양쪽 공백을 무시하되, 같은 주소의 대소문자 변형 계정이
 * 둘 이상 있으면 임의 계정으로 로그인하지 않도록 조회를 거부합니다.
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { normalizeEmailForRateLimit } from "@/lib/rate-limit-core";

export async function findCredentialUser(rawEmail: string) {
  const normalizedEmail = normalizeEmailForRateLimit(rawEmail);
  const matches = await db.query.users.findMany({
    where: sql`lower(${users.email}) = ${normalizedEmail}`,
    limit: 2,
  });

  return matches.length === 1 ? matches[0] : null;
}
