/** 필수 G1 사례 누락·중복·skip·실패를 종료 코드에 반영하고 원문 오류/네트워크 기록은 출력하지 않는다. */
export const requiredAcademicG1Cases = Object.freeze([
  "ROSTER", "ADMIN_FLOW", "ROLE_MATRIX", "SUBMIT_COUNTS", "FILES", "FILE_BOUNDARIES",
  "FAILURE_RECOVERY", "CONCURRENCY", "CSV", "RETENTION",
]);
const caseId = (test) => /^\[G1:([A-Z_]+)\]/.exec(test.title)?.[1];
export default class AcademicG1Reporter {
  failed = false;
  completed = new Set();
  onBegin(_config, suite) {
    const ids = suite.allTests().map(caseId);
    this.failed = ids.length !== requiredAcademicG1Cases.length ||
      requiredAcademicG1Cases.some((id) => ids.filter((actual) => actual === id).length !== 1);
  }
  onTestEnd(test, result) {
    const id = caseId(test);
    if (!id || result.status !== "passed" || test.expectedStatus !== "passed" || result.retry !== 0 || this.completed.has(id)) this.failed = true;
    if (id) this.completed.add(id);
    console.log(`${result.status === "passed" ? "PASS" : "FAIL"} G1:${id ?? "UNKNOWN"}`);
    if (result.status !== "passed") {
      console.log(`FAIL G1_LOCATION:${id ?? "UNKNOWN"}:${test.location?.line ?? 0}`);
      const codes = new Set((result.errors ?? []).flatMap((error) => error.message?.match(/\bG1_[A-Z0-9_]{2,80}\b/g) ?? []));
      for (const code of codes) console.log(`FAIL G1_ERROR:${code}`);
      for (const error of result.errors ?? []) {
        const line = /academic-g1\.spec\.mts:(\d+):\d+/.exec(error.stack ?? "")?.[1];
        if (line) console.log(`FAIL G1_LOCATION:${id ?? "UNKNOWN"}:${line}`);
      }
    }
  }
  onError(error) {
    this.failed = true; console.log("FAIL G1_ERROR:RUNNER");
    // 경로·헤더 원문 없이 설치 도구의 고정 오류 종류와 지원 파일 줄만 진단한다.
    const location = /academic-g1-network\.mjs:(\d+):\d+/.exec(error.stack ?? "")?.[1];
    if (location) console.log(`FAIL G1_LOCATION:NETWORK:${location}`);
    const message = error.message ?? "";
    for (const [expression, code] of [[/same protocol/i, "PROTOCOL"], [/invalid header/i, "HEADER"],
      [/disallowed/i, "DISALLOWED"], [/unsafe/i, "UNSAFE"], [/closed|disposed/i, "CLOSED"], [/not allowed/i, "NOT_ALLOWED"]]) {
      if (expression.test(message)) console.log(`FAIL G1_ERROR:G1_ROUTE_${code}`);
    }
  }
  onStdOut() { /* 테스트의 임의 출력은 개인정보 없는 사례 결과로 대체한다. */ }
  onStdErr() { /* 원본 오류에는 요청 헤더나 토큰이 있을 수 있어 내보내지 않는다. */ }
  onEnd(result) {
    const failed = this.failed || result.status !== "passed" || requiredAcademicG1Cases.some((id) => !this.completed.has(id));
    console.log(failed ? "FAIL G1_REQUIRED_CASES" : `PASS G1_REQUIRED_CASES:${requiredAcademicG1Cases.length}`);
    return { status: failed ? "failed" : "passed" };
  }
}
