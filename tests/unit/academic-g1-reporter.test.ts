// @vitest-environment node
/** 테스트 누락이나 조건부 skip을 CI 성공으로 처리하지 않는 필수 사례 계약을 검증한다. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AcademicG1Reporter, { requiredAcademicG1Cases } from "../support/academic-g1-reporter.mjs";
const tests = () => requiredAcademicG1Cases.map((id) => ({ title: `[G1:${id}] 시험`, expectedStatus: "passed" }));
beforeEach(() => { vi.spyOn(console, "log").mockImplementation(() => undefined); });
afterEach(() => { vi.restoreAllMocks(); });
it("모든 필수 사례가 한 번씩 실제 통과해야 성공한다", () => {
  const reporter = new AcademicG1Reporter(), cases = tests();
  reporter.onBegin(undefined, { allTests: () => cases });
  for (const test of cases) reporter.onTestEnd(test, { status: "passed", retry: 0 });
  expect(reporter.onEnd({ status: "passed" })).toEqual({ status: "passed" });
});
it.each(["missing", "duplicate", "skip", "retry", "incomplete"])("%s는 실행기 자체가 성공해도 게이트 실패다", (scenario) => {
  const reporter = new AcademicG1Reporter(), cases = tests();
  const declared = scenario === "missing" ? cases.slice(1) : scenario === "duplicate" ? [...cases, cases[0]] : cases;
  reporter.onBegin(undefined, { allTests: () => declared });
  for (const [index, test] of cases.entries()) {
    if (scenario === "incomplete" && index === 0) continue;
    reporter.onTestEnd(test, { status: scenario === "skip" && index === 0 ? "skipped" : "passed", retry: scenario === "retry" ? 1 : 0 });
  }
  expect(reporter.onEnd({ status: "passed" })).toEqual({ status: "failed" });
});
