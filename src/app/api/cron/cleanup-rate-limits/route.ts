/**
 * Vercel 일일 작업으로 요청 제한 로그를 정리합니다 (#121).
 * 가장 긴 제한 창(24시간)보다 긴 48시간만 보존합니다.
 */
import { timingSafeEqual } from "node:crypto";
import { lt } from "drizzle-orm";
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
    // 과거 세 테이블은 더 이상 기록하지 않지만 기존 개인정보를 함께 만료합니다.
    await db.batch([
      db.delete(rateLimitEvents).where(lt(rateLimitEvents.attemptedAt, cutoff)),
      db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, cutoff)),
      db.delete(uploadRateLimitLog).where(lt(uploadRateLimitLog.attemptedAt, cutoff)),
      db.delete(applicationSubmissionsLog).where(lt(applicationSubmissionsLog.createdAt, cutoff)),
    ]);
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    logServerError("rate-limit/cleanup", error);
    return NextResponse.json({ error: "정리 작업이 실패했습니다." }, { status: 500 });
  }
}
