// @vitest-environment node
/** 공개 일정 API의 사이트 경로 감사가 필수 연·월을 넣어 실제 200 경로를 검사합니다. */
import { expect, it } from "vitest";
import { concreteSiteRoute } from "../support/site-route-fixture.mjs";

it("일정만 합성 연·월로 구체화하고 다른 API 경로는 유지한다", () => {
  expect(concreteSiteRoute("/api/v1/schedule")).toBe("/api/v1/schedule?year=2026&month=10");
  expect(concreteSiteRoute("/api/v1/notices")).toBe("/api/v1/notices");
  expect(concreteSiteRoute("/api/v1/me")).toBe("/api/v1/me");
});
