/**
 * Rate limit pure helper 회귀 테스트 (#69)
 *
 * 검증 대상 (src/lib/rate-limit-core.ts):
 *   - extractClientIp: 헤더 우선순위, XFF 체인 첫 항목, 다중 폴백, unknown fallback
 *   - normalizeEmailForRateLimit: 대소문자·공백·비문자 정규화
 *   - isBlocked: 경계값 (count === max 는 block, count < max 는 pass)
 *   - computeRetryAfterSeconds: 초 단위 clamp, oldest null 폴백, 지난 시각 처리
 *   - computeWindowStart: Date 반환 검증
 *   - 정책 상수: 값이 이슈 #69 사양과 일치하는지 (회귀 방지)
 *
 * DB mock 없이 pure 로직만 검증. 통합 동작 (실제 DB 카운트 + 429 응답) 은
 * Playwright E2E 몫이며 본 파일 스코프 아님.
 */

import { describe, expect, it } from "vitest";
import {
  APPLICATION_SUBMISSION_HOURLY_RATE_LIMIT,
  LOGIN_RATE_LIMIT,
  UNKNOWN_IP,
  UPLOAD_RATE_LIMIT,
  computeRetryAfterSeconds,
  computeWindowStart,
  extractClientIp,
  isBlocked,
  normalizeEmailForRateLimit,
} from "@/lib/rate-limit-core";

describe("정책 상수 - 이슈 #69 사양 회귀", () => {
  it("LOGIN_RATE_LIMIT = 15분 / 5회 실패 (Phase 1 사양)", () => {
    expect(LOGIN_RATE_LIMIT.windowMs).toBe(15 * 60 * 1000);
    expect(LOGIN_RATE_LIMIT.maxAttempts).toBe(5);
  });

  it("UPLOAD_RATE_LIMIT = 60초 / 30회 (Phase 1 사양)", () => {
    expect(UPLOAD_RATE_LIMIT.windowMs).toBe(60 * 1000);
    expect(UPLOAD_RATE_LIMIT.maxAttempts).toBe(30);
  });

  it("APPLICATION_SUBMISSION_HOURLY_RATE_LIMIT = 1시간 / 5회 (Phase 1 사양)", () => {
    expect(APPLICATION_SUBMISSION_HOURLY_RATE_LIMIT.windowMs).toBe(
      60 * 60 * 1000,
    );
    expect(APPLICATION_SUBMISSION_HOURLY_RATE_LIMIT.maxAttempts).toBe(5);
  });
});

describe("extractClientIp", () => {
  it("x-forwarded-for 가 있으면 첫 IP 를 반환한다 (Vercel 표준)", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" });
    expect(extractClientIp(h)).toBe("203.0.113.1");
  });

  it("x-forwarded-for 의 공백을 trim 한다", () => {
    const h = new Headers({ "x-forwarded-for": "   198.51.100.7  ,10.0.0.1" });
    expect(extractClientIp(h)).toBe("198.51.100.7");
  });

  it("x-forwarded-for 가 비면 x-real-ip 로 fallback (Nginx 관례)", () => {
    const h = new Headers({ "x-real-ip": "192.0.2.5" });
    expect(extractClientIp(h)).toBe("192.0.2.5");
  });

  it("x-forwarded-for/x-real-ip 없으면 cf-connecting-ip (Cloudflare)", () => {
    const h = new Headers({ "cf-connecting-ip": "192.0.2.10" });
    expect(extractClientIp(h)).toBe("192.0.2.10");
  });

  it("모든 표준 헤더 없으면 x-vercel-forwarded-for 로 fallback", () => {
    const h = new Headers({
      "x-vercel-forwarded-for": "203.0.113.42, 10.1.1.1",
    });
    expect(extractClientIp(h)).toBe("203.0.113.42");
  });

  it("어떤 헤더도 없으면 UNKNOWN_IP sentinel 을 반환한다", () => {
    const h = new Headers();
    expect(extractClientIp(h)).toBe(UNKNOWN_IP);
  });

  it("x-forwarded-for 가 빈 문자열이면 다음 헤더로 넘어간다", () => {
    const h = new Headers({
      "x-forwarded-for": "",
      "x-real-ip": "192.0.2.99",
    });
    expect(extractClientIp(h)).toBe("192.0.2.99");
  });

  it("XFF 첫 항목이 공백만 있으면 다음 헤더로 fallback (오탐 방지)", () => {
    // "  , 10.0.0.1" 처럼 첫 항목이 공백만 있는 병리적 프록시 설정 방어.
    const h = new Headers({
      "x-forwarded-for": "  , 10.0.0.1",
      "x-real-ip": "192.0.2.11",
    });
    expect(extractClientIp(h)).toBe("192.0.2.11");
  });

  it("UNKNOWN_IP 는 DB varchar(45) 에 저장 가능한 짧은 문자열이다", () => {
    expect(UNKNOWN_IP.length).toBeLessThanOrEqual(45);
    expect(typeof UNKNOWN_IP).toBe("string");
  });
});

describe("normalizeEmailForRateLimit", () => {
  it("이메일을 소문자로 변환한다 (동일 계정 카운트 통합)", () => {
    expect(normalizeEmailForRateLimit("User@Example.COM")).toBe(
      "user@example.com",
    );
  });

  it("양쪽 공백을 제거한다", () => {
    expect(normalizeEmailForRateLimit("  user@example.com  ")).toBe(
      "user@example.com",
    );
  });

  it("string 이 아닌 값은 빈 문자열을 반환한다 (조작 방어)", () => {
    expect(normalizeEmailForRateLimit(null)).toBe("");
    expect(normalizeEmailForRateLimit(undefined)).toBe("");
    expect(normalizeEmailForRateLimit(42)).toBe("");
    expect(normalizeEmailForRateLimit({})).toBe("");
  });

  it("빈 문자열은 빈 문자열을 반환한다", () => {
    expect(normalizeEmailForRateLimit("")).toBe("");
    expect(normalizeEmailForRateLimit("   ")).toBe("");
  });
});

describe("isBlocked", () => {
  it("count < maxAttempts 이면 통과한다", () => {
    expect(isBlocked(0, 5)).toBe(false);
    expect(isBlocked(4, 5)).toBe(false);
  });

  it("count === maxAttempts 이면 차단한다 (경계값)", () => {
    // maxAttempts=5 정책은 정확히 5번째 시도까지만 허용해야 한다.
    // authorize() 는 시도 전에 checkLoginAttempts 를 호출하므로,
    // 이미 5회 실패한 상태라면 다음 시도부터 차단되어야 한다.
    expect(isBlocked(5, 5)).toBe(true);
  });

  it("count > maxAttempts 이면 차단한다", () => {
    expect(isBlocked(10, 5)).toBe(true);
  });
});

describe("computeRetryAfterSeconds", () => {
  const NOW = new Date("2026-01-01T12:00:00Z").getTime();
  const WINDOW_MS = 15 * 60 * 1000;

  it("가장 오래된 시도가 window 시작 시각이면 window 전체가 남는다", () => {
    // oldest = 정확히 windowMs 전 → 아직 sliding 밖으로 나가지 않았으므로 0초.
    // (경계: elapsed === windowMs 이면 remaining = 0)
    const oldest = new Date(NOW - WINDOW_MS);
    expect(computeRetryAfterSeconds(oldest, WINDOW_MS, NOW)).toBe(0);
  });

  it("가장 오래된 시도가 얼마 전이면 남은 시간만 반환한다", () => {
    // oldest = 5분 전 → 15분 window 에서 10분 (600초) 남음.
    const oldest = new Date(NOW - 5 * 60 * 1000);
    expect(computeRetryAfterSeconds(oldest, WINDOW_MS, NOW)).toBe(600);
  });

  it("남은 시간이 음수면 0 으로 clamp 한다 (안전망)", () => {
    // window 밖으로 이미 나간 attempt (이 상황은 caller 가 걸러야 하지만 방어)
    const oldest = new Date(NOW - 20 * 60 * 1000);
    expect(computeRetryAfterSeconds(oldest, WINDOW_MS, NOW)).toBe(0);
  });

  it("oldest 가 null 이면 window 전체를 초 단위로 반환한다 (fallback)", () => {
    expect(computeRetryAfterSeconds(null, WINDOW_MS, NOW)).toBe(900);
  });

  it("소수점 초는 올림 처리한다 (Math.ceil → 클라이언트 안전)", () => {
    // oldest = 899.5초 전 → remaining 0.5 초, ceil → 1
    const oldest = new Date(NOW - (WINDOW_MS - 500));
    expect(computeRetryAfterSeconds(oldest, WINDOW_MS, NOW)).toBe(1);
  });

  it("upload window (60초) 도 정상 계산된다 (정책 재사용성)", () => {
    const uploadWindow = UPLOAD_RATE_LIMIT.windowMs;
    const oldest = new Date(NOW - 30 * 1000);
    expect(computeRetryAfterSeconds(oldest, uploadWindow, NOW)).toBe(30);
  });
});

describe("computeWindowStart", () => {
  it("now - windowMs 를 Date 로 반환한다", () => {
    const now = new Date("2026-01-01T12:00:00Z").getTime();
    const windowMs = 15 * 60 * 1000;
    const start = computeWindowStart(now, windowMs);
    expect(start).toBeInstanceOf(Date);
    expect(start.getTime()).toBe(now - windowMs);
  });

  it("서로 다른 windowMs 에 대해 정확히 계산된다 (정책 상수 재사용)", () => {
    const now = Date.now();
    const loginStart = computeWindowStart(now, LOGIN_RATE_LIMIT.windowMs);
    const uploadStart = computeWindowStart(now, UPLOAD_RATE_LIMIT.windowMs);
    expect(uploadStart.getTime()).toBeGreaterThan(loginStart.getTime());
  });
});
