/** 릴리스 관련 JSON만 읽는다. 네트워크·쓰기·npm lifecycle 실행은 없다. */
import { readFileSync } from "node:fs";
import { validateReleaseFiles } from "./_lib/release-policy.mjs";
const json = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
try {
  const errors = validateReleaseFiles({
    config: json("release-please-config.json"),
    manifest: json(".release-please-manifest.json"),
    packageJson: json("package.json"),
    lockfile: json("package-lock.json"),
  });
  for (const error of errors) console.error(error);
  console.log(errors.length ? "릴리스 설정 검사 실패" : "릴리스 설정·버전 동기화 검사 통과");
  process.exitCode = errors.length ? 1 : 0;
} catch (error) {
  console.error("릴리스 설정을 읽지 못했습니다:", error instanceof Error ? error.message : "알 수 없는 오류");
  process.exitCode = 1;
}
