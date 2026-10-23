import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const allowed = /^(feat|fix|perf|revert|docs|style|refactor|test|build|ci|chore)(\([a-z][a-z0-9-]*\))?!?: \S.*$/;
const shaPattern = /^[0-9a-f]{40}$/i;

export function validateSubject(subject) {
  // GitHub 기본 병합 커밋은 PR 번호와 원래 연결 관계를 보존한다.
  if (/^Merge (pull request #\d+|branch\b|remote-tracking branch\b)/.test(subject)) return null;
  return allowed.test(subject) ? null : "Conventional Commits 형식이 아닙니다: " + subject;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trimEnd();
}

function checkHistory(base, head) {
  if (!shaPattern.test(head) || (base && !shaPattern.test(base))) throw new Error("잘못된 SHA");
  let range = head;
  if (base && !/^0{40}$/.test(base)) {
    if (spawnSync("git", ["merge-base", "--is-ancestor", base, head]).status === 0) {
      range = base + ".." + head;
    } else {
      // 이전 HEAD가 현 HEAD의 조상이 아니면 전체 히스토리의 제목을 검사한다.
      console.log("강제 업데이트: 전체 이력 검사");
    }
  }
  const shas = git(["rev-list", "--no-merges", range]).split("\n").filter(Boolean);
  const errors = shas.flatMap(sha => {
    const problem = validateSubject(git(["show", "-s", "--format=%s", sha]));
    return problem ? [sha.slice(0, 12) + ": " + problem] : [];
  });
  console.log("검사한 커밋: " + shas.length + ", 형식 위반: " + errors.length);
  if (errors.length) {
    errors.forEach(error => console.error(error));
    process.exitCode = 1;
  }
}

function main() {
  const [mode, file, head] = process.argv.slice(2);
  if (mode === "--message-file") {
    if (!file) throw new Error("메시지 파일 누락");
    const title = readFileSync(file, "utf8").split(/\r?\n/, 1)[0].trim();
    const problem = validateSubject(title);
    if (problem) { console.error(problem); process.exitCode = 1; }
  } else if (mode === "--history") {
    checkHistory(file ?? "", head ?? "");
  } else {
    throw new Error("사용법: --message-file <path> 또는 --history <base-sha> <head-sha>");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
