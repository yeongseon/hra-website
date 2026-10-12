/**
 * 이슈·PR 형식 검사 실행기
 *
 * 역할:
 *   scripts/_lib/process-format.mjs 의 규칙으로 실제 GitHub 이슈·PR 을 검사한다.
 *
 * 사용법:
 *   npm run issues:check                 열린 이슈 전체 검사 (gh CLI 로그인 필요)
 *   node scripts/check-process-format.mjs --event
 *                                        GitHub Actions 전용. 이벤트(이슈 또는 PR) 한 건을 검사한다.
 *
 * --event 동작:
 *   - 이슈: 위반이 있으면 이슈에 안내 댓글을 하나 남기고(이미 있으면 그 댓글을 고친다) 실패로 끝난다.
 *           위반이 없어지면 같은 댓글을 "통과" 로 고친다. 상태 라벨은 만들지 않는다.
 *   - PR:   위반이 있으면 검사가 실패한다. 댓글은 남기지 않는다 (fork PR 은 쓰기 권한이 없다).
 *
 * 보안: 이슈·PR 의 제목과 본문은 외부 입력이다. 셸 문자열에 끼워 넣지 않고 execFileSync 의
 *   인자 배열과 표준 입력으로만 전달한다.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { validateIssue, validatePullRequest } from "./_lib/process-format.mjs";

// 안내 댓글을 다시 찾기 위한 표식 (화면에는 보이지 않는다).
const MARKER = "<!-- process-format-check -->";

function gh(args, input) {
  return execFileSync("gh", args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "inherit"] });
}

// 열린 이슈 전체를 검사하고 위반 건수를 반환한다.
function checkAllOpenIssues() {
  const issues = JSON.parse(
    gh(["issue", "list", "--state", "open", "--limit", "500", "--json", "number,title,body,labels"]),
  );
  let failed = 0;
  for (const issue of issues.sort((a, b) => a.number - b.number)) {
    const errors = validateIssue({
      title: issue.title,
      body: issue.body,
      labels: issue.labels.map((label) => label.name),
    });
    if (errors.length > 0) {
      failed += 1;
      console.log(`✗ #${issue.number} ${issue.title}`);
      for (const error of errors) console.log(`    - ${error}`);
    }
  }
  console.log(`\n열린 이슈 ${issues.length}건 중 ${failed}건이 형식에 맞지 않습니다.`);
  return failed;
}

// 이슈에 달린 안내 댓글(표식 포함)의 id 를 찾는다. 없으면 null.
function findMarkerComment(repo, number) {
  const comments = JSON.parse(gh(["api", "--paginate", `repos/${repo}/issues/${number}/comments`]));
  const found = comments.find((comment) => typeof comment.body === "string" && comment.body.includes(MARKER));
  return found ? found.id : null;
}

function upsertComment(repo, number, commentId, body) {
  const payload = JSON.stringify({ body });
  if (commentId) {
    gh(["api", "-X", "PATCH", `repos/${repo}/issues/comments/${commentId}`, "--input", "-"], payload);
  } else {
    gh(["api", "-X", "POST", `repos/${repo}/issues/${number}/comments`, "--input", "-"], payload);
  }
}

// GitHub Actions 이벤트 한 건을 검사한다. 위반 건수를 반환한다.
function checkEvent() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const repo = process.env.GITHUB_REPOSITORY;

  if (event.pull_request) {
    const errors = validatePullRequest({ body: event.pull_request.body });
    for (const error of errors) console.log(`- ${error}`);
    if (errors.length === 0) console.log("PR 형식 확인 통과");
    return errors.length;
  }

  // PR 댓글 등 이슈가 아닌 이벤트는 대상이 아니다.
  if (!event.issue || event.issue.pull_request) return 0;

  // 이벤트에 담긴 내용은 발생 시점의 스냅샷이다. 라벨을 여러 개 연달아 붙이면 실행이 여러 번 일어나므로,
  // 늦게 끝난 실행이 옛 상태로 판정하지 않도록 지금 상태를 다시 읽는다.
  const issue = JSON.parse(gh(["api", `repos/${repo}/issues/${event.issue.number}`]));

  const errors = validateIssue({
    title: issue.title,
    body: issue.body,
    labels: (issue.labels ?? []).map((label) => label.name),
  });
  const commentId = findMarkerComment(repo, issue.number);

  if (errors.length > 0) {
    for (const error of errors) console.log(`- ${error}`);
    upsertComment(
      repo,
      issue.number,
      commentId,
      `${MARKER}\n이 이슈는 저장소의 이슈 형식과 다릅니다. 아래 항목을 고치면 이 댓글이 자동으로 갱신됩니다.\n\n` +
        errors.map((error) => `- ${error}`).join("\n") +
        "\n\n라벨을 바꿀 권한이 없다면 그대로 두세요. 관리자가 지정합니다." +
        "\n형식 안내: `docs/contributing/workflow.md` 의 \"이슈로 작업 정하기\"",
    );
  } else {
    console.log("이슈 형식 확인 통과");
    if (commentId) {
      upsertComment(repo, issue.number, commentId, `${MARKER}\n이슈 형식 확인 통과.`);
    }
  }
  return errors.length;
}

const failed = process.argv.includes("--event") ? checkEvent() : checkAllOpenIssues();
process.exit(failed > 0 ? 1 : 0);
