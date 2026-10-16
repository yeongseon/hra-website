/**
 * 저장소의 실제 Drizzle 스키마를 환경 파일·DB 연결 없이 SQL로 내보내는 QA 공용 유틸입니다.
 * 읽기 경로 실행기와 같은 설치된 drizzle-kit export 계약을 사용하며 임시 SQL 파일이 필요 없습니다.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function exportQaSchemaSql(repository = fileURLToPath(new URL("../..", import.meta.url))) {
  // CLI가 환경 파일을 자동으로 읽을 여지를 실행 전에 차단하며 파일 내용에는 접근하지 않습니다.
  if (readdirSync(repository).some(name => name === ".env" || /^\.env\.(?:local|development|production|test)(?:\.local)?$/.test(name))) {
    throw new Error("스키마 QA는 환경 파일이 없는 체크아웃에서 실행해야 합니다.");
  }
  const environment = Object.fromEntries(["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT"]
    .filter(key => process.env[key]).map(key => [key, process.env[key]]));
  const result = spawnSync(process.execPath, [join(repository, "node_modules/drizzle-kit/bin.cjs"),
    "export", "--dialect", "postgresql", "--schema", "./src/lib/db/schema.ts"],
  { cwd: repository, env: environment, encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0 || result.error || !result.stdout.includes('CREATE TABLE "users"')) {
    throw new Error("격리 QA 스키마 내보내기에 실패했습니다.");
  }
  return result.stdout;
}
