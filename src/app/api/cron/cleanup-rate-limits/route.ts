/**
 * Vercel 일일 작업으로 요청 제한 로그를 정리합니다 (#121).
 * 가장 긴 제한 창(24시간)보다 긴 48시간만 보존합니다.
 */
import { timingSafeEqual } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  applicationSubmissionsLog,
  loginAttempts,
  rateLimitEvents,
  uploadRateLimitLog,
} from "@/lib/db/schema";
import { logServerError } from "@/lib/errors";

export const runtime = "nodejs";

/** 설정된 CRON_SECRET과 Bearer 값을 길이·내용 모두 확인합니다. */
function authorized(request: NextRequest, secret: string): boolean {
  const supplied = request.headers.get("authorization");
  if (!supplied?.startsWith("Bearer ")) return false;
  const actual = Buffer.from(supplied.slice(7));
  const expected = Buffer.from(secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "정리 작업 설정이 없습니다." }, { status: 503 });
  }
  if (!authorized(request, secret)) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  try {
    // 과거 제한 테이블은 배포 시점에 따라 없을 수 있습니다. 존재 확인 뒤에만
    // 삭제해 신규 이벤트 정리까지 함께 실패하는 일을 막습니다.
    const result = await db.execute(sql`
      SELECT
        to_regclass('public.login_attempts') IS NOT NULL AS login_table,
        to_regclass('public.upload_rate_limit_log') IS NOT NULL AS upload_table,
        to_regclass('public.application_submissions_log') IS NOT NULL AS submissions_table
    `);
    const present = result.rows[0];
    if (
      typeof present?.login_table !== "boolean" ||
      typeof present.upload_table !== "boolean" ||
      typeof present.submissions_table !== "boolean"
    ) throw new Error("요청 제한 로그 테이블 확인 결과가 올바르지 않습니다.");

    await db.delete(rateLimitEvents).where(lt(rateLimitEvents.attemptedAt, cutoff));
    if (present.login_table) {
      await db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, cutoff));
    }
    if (present.upload_table) {
      await db.delete(uploadRateLimitLog).where(lt(uploadRateLimitLog.attemptedAt, cutoff));
    }
    if (present.submissions_table) {
      await db.delete(applicationSubmissionsLog).where(lt(applicationSubmissionsLog.createdAt, cutoff));
    }
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    logServerError("rate-limit/cleanup", error);
    return NextResponse.json({ error: "정리 작업이 실패했습니다." }, { status: 500 });
  }
}
