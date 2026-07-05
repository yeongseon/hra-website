/**
 * Rate limit DB 통합 헬퍼 (#69)
 *
 * `rate-limit-core.ts` 의 pure helper·정책 상수를 사용해 실제 Neon Postgres 쿼리를
 * 실행하는 얇은 어댑터. 각 엔드포인트는 이 모듈의 check/record 함수만 호출하면
 * 되고, 정책 조정·IP 파싱·경계값 로직은 core 에 집중되어 있다.
 *
 * 분리 이유 (auth-session.ts 패턴 준용):
 *   pure 로직은 core 에서 vitest 로 회귀 테스트하고, 이 파일은 DB wiring 만 담당해
 *   Playwright / 통합 테스트로 검증한다.
 *
 * 실패 정책:
 *   - check 는 DB 오류 발생 시 "fail open" (blocked=false). 이유:
 *     Rate limit 검사 실패로 legitimate 사용자가 로그인/업로드/제출을 못하면
 *     서비스 가용성이 떨어진다. 반면 DB 다운 중에 잠깐 abuse 가 통과해도
 *     동시 트래픽이 제한적 (Neon 자체가 rate limit 을 갖고 있음).
 *   - record 는 실패해도 caller 요청 자체는 성공 처리. logServerError 로 관측만.
 *
 * TOCTOU 노트:
 *   Neon serverless HTTP 드라이버는 트랜잭션이 제한적이라 count-then-record 사이에
 *   race window 가 있다. Rate limit 은 eventually consistent 로 충분하며,
 *   허용 오차 (한두 건의 over-shoot) 는 정책 값 자체의 여유로 흡수한다.
 */

import { and, count, eq, gte, min } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applicationSubmissionsLog,
  loginAttempts,
  uploadRateLimitLog,
} from "@/lib/db/schema";
import { logServerError } from "@/lib/errors";
import {
  APPLICATION_SUBMISSION_HOURLY_RATE_LIMIT,
  LOGIN_RATE_LIMIT,
  UPLOAD_RATE_LIMIT,
  computeRetryAfterSeconds,
  computeWindowStart,
  isBlocked,
  normalizeEmailForRateLimit,
} from "@/lib/rate-limit-core";

/**
 * check 결과 공용 shape.
 * - blocked: 즉시 차단 여부 (429 반환 판단 근거).
 * - retryAfterSec: Retry-After 헤더에 넣을 초 (0 이상 정수).
 */
export type RateLimitCheckResult = {
  blocked: boolean;
  retryAfterSec: number;
};

/**
 * 로그인 시도 rate limit 판정 (#69).
 *
 * 정책: `LOGIN_RATE_LIMIT` (15분 / 실패 5회).
 * 매칭 키: (ip=? AND email=?) AND success=false
 *   - 이슈 #69 사양대로 "IP+email 기준" — 두 축의 조합 (AND) 단위로 잠금한다.
 *   - (IP,email) 조합 단위이므로 다음 회귀를 회피한다:
 *       * 공유 IP 연쇄 lockout: 카페/학교 NAT 뒤 한 사용자가 5회 실패해도 다른
 *         사용자는 자신의 email 조합이 다르므로 계속 정상 로그인 가능.
 *       * 원격 관리자 lockout: 공격자가 특정 관리자 email 로 아무 IP 에서 5회
 *         실패해도, 관리자 본인 IP+email 조합의 카운트는 0 이라 정상 로그인 가능.
 *   - credential stuffing / password spray 는 각 (IP,email) 조합 단위로 개별 잠금.
 *     공격자 IP·email 순회 자체는 감지 대상이 아니라 다른 층 (IDS, WAF) 의 몫.
 *   - email 이 비어 있는 병리 케이스 (authorize 에 email 없이 도달) 만 IP 단독
 *     fallback 을 사용한다. email='' 로 조합 카운트하면 익명 실패들이 통합돼
 *     legitimate 익명 사용자에게 오탐될 수 있어 축에서 제외.
 *
 * 성공한 시도는 카운트하지 않는다 → 정상 사용자가 실패 후 성공한 뒤에도 이후
 * 정상 접속에 영향이 없다.
 *
 * @param ip 클라이언트 IP (extractClientIp 로 파싱한 값). UNKNOWN_IP 도 그대로 사용.
 * @param rawEmail 사용자가 입력한 이메일. 내부에서 정규화(lowercase+trim) 한다.
 */
export async function checkLoginAttempts(
  ip: string,
  rawEmail: unknown,
): Promise<RateLimitCheckResult> {
  const email = normalizeEmailForRateLimit(rawEmail);
  const since = computeWindowStart(Date.now(), LOGIN_RATE_LIMIT.windowMs);

  try {
    // 매칭 축: 항상 (실패, window 내) 를 기본으로 하되, 이메일이 비어 있으면
    // IP 단독으로, 이메일이 있으면 IP AND email 조합으로 좁힌다.
    // (email='' 로 카운트하면 서로 다른 익명 시도들이 통합돼 legitimate 익명
    //  사용자에게 영향을 줄 수 있으므로 빈 이메일은 축에서 제외.)
    const identityFilter = email
      ? and(eq(loginAttempts.ip, ip), eq(loginAttempts.email, email))
      : eq(loginAttempts.ip, ip);

    const [row] = await db
      .select({
        cnt: count(),
        oldest: min(loginAttempts.attemptedAt),
      })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.success, false),
          gte(loginAttempts.attemptedAt, since),
          identityFilter,
        ),
      );

    const cnt = row?.cnt ?? 0;
    if (!isBlocked(cnt, LOGIN_RATE_LIMIT.maxAttempts)) {
      return { blocked: false, retryAfterSec: 0 };
    }
    return {
      blocked: true,
      retryAfterSec: computeRetryAfterSeconds(
        row?.oldest ?? null,
        LOGIN_RATE_LIMIT.windowMs,
        Date.now(),
      ),
    };
  } catch (error) {
    // fail open — 서비스 가용성 우선.
    logServerError("rate-limit/check-login", error);
    return { blocked: false, retryAfterSec: 0 };
  }
}

/**
 * 로그인 시도 결과 기록 (#69).
 *
 * authorize() 는 이 함수를 매 시도마다 호출한다. 실패로 기록된 로우가 다음
 * checkLoginAttempts 의 sliding window 판정 근거가 된다.
 *
 * blocked 상태에서도 계속 기록할지 여부는 caller 가 결정. 기본 정책은
 * "차단된 시도도 여전히 기록" (기록하지 않으면 공격자가 무한 요청으로 로그를
 * 우회할 수 있고, 429 이후 UI 표시된 대기시간이 실제 만료되지 않는 문제 발생).
 *
 * @param ip 클라이언트 IP.
 * @param rawEmail 사용자가 입력한 이메일 (정규화 전 원본).
 * @param success authorize() 최종 결과 (bcrypt 통과 및 user row 매칭).
 */
export async function recordLoginAttempt(
  ip: string,
  rawEmail: unknown,
  success: boolean,
): Promise<void> {
  const email = normalizeEmailForRateLimit(rawEmail);
  try {
    await db.insert(loginAttempts).values({
      ip,
      email: email || null,
      success,
    });
  } catch (error) {
    logServerError("rate-limit/record-login", error);
  }
}

/**
 * 이미지 업로드 rate limit 판정 (#69).
 *
 * 정책: `UPLOAD_RATE_LIMIT` (60초 / 30회).
 * 매칭 키: IP.
 *
 * 업로드는 로그인 요구 엔드포인트이지만, 정책상 IP 로 계약된 이유는
 * (1) 이슈 #69 사양이 IP 기준, (2) IP 는 Vercel Blob 실비 폭증 위험의 실 주체.
 */
export async function checkUploadRateLimit(
  ip: string,
): Promise<RateLimitCheckResult> {
  const since = computeWindowStart(Date.now(), UPLOAD_RATE_LIMIT.windowMs);

  try {
    const [row] = await db
      .select({
        cnt: count(),
        oldest: min(uploadRateLimitLog.attemptedAt),
      })
      .from(uploadRateLimitLog)
      .where(
        and(
          eq(uploadRateLimitLog.ip, ip),
          gte(uploadRateLimitLog.attemptedAt, since),
        ),
      );

    const cnt = row?.cnt ?? 0;
    if (!isBlocked(cnt, UPLOAD_RATE_LIMIT.maxAttempts)) {
      return { blocked: false, retryAfterSec: 0 };
    }
    return {
      blocked: true,
      retryAfterSec: computeRetryAfterSeconds(
        row?.oldest ?? null,
        UPLOAD_RATE_LIMIT.windowMs,
        Date.now(),
      ),
    };
  } catch (error) {
    logServerError("rate-limit/check-upload", error);
    return { blocked: false, retryAfterSec: 0 };
  }
}

/**
 * 이미지 업로드 이벤트 기록 (#69).
 *
 * 성공/실패 구분 없이 IP+시각만 기록 (업로드는 인증된 시도이므로 실패는 대부분
 * 자동화된 조작이 아닌 일반 오류). 429 를 받은 시도도 기록해 sliding window 가
 * 자연스럽게 만료되도록 한다 (recordLoginAttempt 와 동일 정책).
 */
export async function recordUploadAttempt(ip: string): Promise<void> {
  try {
    await db.insert(uploadRateLimitLog).values({ ip });
  } catch (error) {
    logServerError("rate-limit/record-upload", error);
  }
}

/**
 * 지원서 제출 시간당 rate limit 판정 (#69).
 *
 * 정책: `APPLICATION_SUBMISSION_HOURLY_RATE_LIMIT` (1시간 / 5회).
 * 매칭 키: IP.
 * 카운트 대상: `applicationSubmissionsLog` (기존 테이블 재사용).
 *
 * 기존 24시간 10회 제한 (submissions.ts:117-129) 은 그대로 유지되며, 이 헬퍼는
 * 짧은 스퍼트 방어를 위한 보완 층이다. 두 축이 동시에 검사되므로 어느 하나만
 * 초과해도 차단된다.
 */
export async function checkApplicationSubmissionHourlyLimit(
  ip: string,
): Promise<RateLimitCheckResult> {
  const since = computeWindowStart(
    Date.now(),
    APPLICATION_SUBMISSION_HOURLY_RATE_LIMIT.windowMs,
  );

  try {
    const [row] = await db
      .select({
        cnt: count(),
        oldest: min(applicationSubmissionsLog.createdAt),
      })
      .from(applicationSubmissionsLog)
      .where(
        and(
          eq(applicationSubmissionsLog.ip, ip),
          gte(applicationSubmissionsLog.createdAt, since),
        ),
      );

    const cnt = row?.cnt ?? 0;
    if (
      !isBlocked(cnt, APPLICATION_SUBMISSION_HOURLY_RATE_LIMIT.maxAttempts)
    ) {
      return { blocked: false, retryAfterSec: 0 };
    }
    return {
      blocked: true,
      retryAfterSec: computeRetryAfterSeconds(
        row?.oldest ?? null,
        APPLICATION_SUBMISSION_HOURLY_RATE_LIMIT.windowMs,
        Date.now(),
      ),
    };
  } catch (error) {
    logServerError("rate-limit/check-application-hourly", error);
    return { blocked: false, retryAfterSec: 0 };
  }
}
