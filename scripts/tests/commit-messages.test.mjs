import assert from "node:assert/strict";
import test from "node:test";
import { validateSubject } from "../check-commit-messages.mjs";

for (const message of [
  "feat: 새 페이지 추가",
  "fix(auth): 권한 오류 수정",
  "fix(db)!: 위험한 DB 명령 차단",
  "chore(deps-dev): bump tool",
  "Merge pull request #1 from yeongseon/fix/example",
]) {
  test("허용: " + message, () => assert.equal(validateSubject(message), null));
}
for (const message of [
  "기본 CI 검사 추가", "update stuff", "fix: ", "feat(auth):", "fix(Auth): 수정",
]) {
  test("거부: " + message, () => assert.ok(validateSubject(message)));
}
