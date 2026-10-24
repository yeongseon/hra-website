/**
 * 이슈·PR 형식 규칙 (단일 출처)
 *
 * 역할:
 *   - GitHub 이슈와 PR 이 docs/contributing/workflow.md 의 형식을 지키는지 검사하는 순수 함수 모음.
 *   - 이 파일이 규칙의 유일한 정의다. 이슈 폼(.github/ISSUE_TEMPLATE/*.yml)·PR 템플릿·문서는
 *     여기 상수와 같은 값을 써야 하며, tests/unit/process-format.test.ts 가 그 일치를 검증한다.
 *
 * 사용 위치:
 *   - scripts/check-process-format.mjs (로컬 `npm run issues:check`, GitHub Actions)
 *   - tests/unit/process-format.test.ts
 *
 * 왜 필요한가:
 *   이슈 폼은 웹 화면에서 만든 이슈에만 적용된다. `gh issue create` 나 API 로 만든 이슈는
 *   폼을 거치지 않아 제목·라벨·본문 구조가 제각각이 되었고 (2026-10-12 정리), 이를 막으려면
 *   생성 경로와 무관하게 결과물을 검사해야 한다.
 */

// 분류 라벨. 새 분류가 필요하면 여기와 workflow.md 를 함께 고치고 GitHub 라벨도 만든다.
export const CATEGORIES = ["보안", "무결성", "검증", "업로드", "기능", "접근성", "품질"];

// 우선순위 라벨. P0 는 비공개로 다뤄야 하는 긴급 보안 건을 위해 예약한다.
export const PRIORITIES = ["P0", "P1", "P2"];

// 종류 라벨. 한 이슈는 이 중 정확히 하나만 가진다.
//   bug = 버그, enhancement = 작업, question = 정책 확인, 추적 = 다른 이슈의 체크리스트
export const TYPE_LABELS = ["bug", "enhancement", "question", "추적"];

// 종류별 본문 섹션 (### 제목). 마지막 관련 이슈는 폼에 남기되 검사에서는 선택 사항이다.
export const BUG_SECTIONS = ["문제와 기대 결과", "재현 근거와 영향", "완료 조건", "관련 이슈"];
export const TASK_SECTIONS = ["목표", "근거와 범위", "완료 조건", "관련 이슈"];

// PR 본문 필수 섹션 (## 제목). 템플릿은 이 순서로 안내하지만 검사는 순서를 강제하지 않는다.
export const PR_SECTIONS = ["관련 이슈", "변경 내용", "검증 결과", "배포 영향과 리뷰"];

// labels 중 allowed 에 속하는 것이 정확히 하나인지 검사하고 그 값을 반환한다 (아니면 null).
function pickExactlyOne(labels, allowed, name, errors) {
  const found = labels.filter((label) => allowed.includes(label));
  if (found.length !== 1) {
    errors.push(
      `${name} 라벨은 ${allowed.map((l) => `\`${l}\``).join(" / ")} 중 정확히 하나여야 합니다. ` +
        `(현재: ${found.length > 0 ? found.join(", ") : "없음"})`,
    );
    return null;
  }
  return found[0];
}

/**
 * 본문을 제목 수준(level)의 섹션으로 나눈다.
 * 반환: [{ name, content }] — 첫 제목 앞의 글은 버린다.
 */
export function splitSections(body, level) {
  const marker = "#".repeat(level) + " ";
  const sections = [];
  let current = null;
  // 코드 펜스(``` 또는 ~~~) 안에 붙여 넣은 로그·마크다운의 제목 줄은 섹션으로 세지 않는다.
  let fence = null;
  for (const line of String(body ?? "").replace(/\r\n/g, "\n").split("\n")) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const kind = fenceMatch[1][0];
      if (fence === null) fence = kind;
      else if (fence === kind) fence = null;
    }
    if (fence === null && !fenceMatch && line.startsWith(marker)) {
      current = { name: line.slice(marker.length).trim(), lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return sections.map((s) => ({ name: s.name, content: s.lines.join("\n").trim() }));
}

// 핵심 섹션의 존재·중복·내용만 검사한다. 순서와 별도의 보조 섹션은 자유다.
function checkSections(body, level, required, errors) {
  const marker = "#".repeat(level);
  const sections = splitSections(body, level);
  for (const name of required) {
    const matches = sections.filter((section) => section.name === name);
    if (matches.length !== 1) {
      errors.push(`\`${marker} ${name}\` 섹션은 정확히 한 번 있어야 합니다. (현재: ${matches.length}개)`);
      continue;
    }
    // 이슈 폼에서 비워 둔 칸은 "_No response_" 로 들어온다.
    const section = matches[0];
    if (section.content === "" || section.content === "_No response_") {
      errors.push(`\`${marker} ${name}\` 섹션에 핵심 내용을 적어주세요.`);
    }
  }
  return sections;
}

/**
 * 이슈 한 건을 검사한다.
 * 입력: { title, body, labels: string[] }
 * 반환: 위반 메시지 배열 (빈 배열이면 통과)
 *
 * 규칙 요약:
 *   - 제목: 비어 있지 않은 요약.
 *   - 라벨: 종류 1개. 버그·작업은 우선순위 1개, 분류는 최대 1개. 정책 확인·추적은 우선순위·분류를 붙이지 않는다.
 *   - 본문: 종류별 핵심 ### 섹션 세 개와 완료 체크리스트. 관련 이슈·추가 섹션은 선택한다.
 */
export function validateIssue({ title, body, labels }) {
  const errors = [];
  const safeTitle = String(title ?? "");
  const safeLabels = labels ?? [];

  if (safeTitle.trim() === "") errors.push("제목이 비어 있습니다.");

  const type = pickExactlyOne(safeLabels, TYPE_LABELS, "종류", errors);
  const priorities = safeLabels.filter((label) => PRIORITIES.includes(label));
  const categories = safeLabels.filter((label) => CATEGORIES.includes(label));

  if (type === "bug" || type === "enhancement") {
    pickExactlyOne(safeLabels, PRIORITIES, "우선순위", errors);
    if (categories.length > 1) errors.push("분류 라벨은 최대 하나만 붙입니다.");
  } else if (type === "question" || type === "추적") {
    if (priorities.length > 0 || categories.length > 0) {
      errors.push(
        `\`${type}\` 이슈에는 우선순위·분류 라벨을 붙이지 않습니다. ` +
          `(현재: ${[...priorities, ...categories].join(", ")})`,
      );
    }
  }

  // 추적 이슈: 다른 이슈의 체크리스트만 담으므로 본문 구조는 자유.
  if (type === "추적") {
    if (!/- \[[ xX]\] #\d+/.test(String(body ?? ""))) {
      errors.push("`추적` 이슈 본문에는 `- [ ] #번호` 형태의 체크리스트가 있어야 합니다.");
    }
    return errors;
  }

  // 종류 라벨이 없을 때에도 작성한 핵심 섹션을 기준으로 검사해 불필요한 재작성을 요구하지 않는다.
  let expected = type === "bug" ? BUG_SECTIONS.slice(0, 3) : TASK_SECTIONS.slice(0, 3);
  if (type === null) {
    const names = new Set(splitSections(body, 3).map((section) => section.name));
    expected = names.has(TASK_SECTIONS[0]) ? TASK_SECTIONS.slice(0, 3) : BUG_SECTIONS.slice(0, 3);
  }
  const sections = checkSections(body, 3, expected, errors);
  const done = sections.find((s) => s.name === "완료 조건");
  if (done && done.content !== "" && !/^\s*[-*] \[[ xX]\] \S/m.test(done.content)) {
    errors.push("`완료 조건` 은 `- [ ] 확인할 수 있는 조건` 형태의 체크리스트여야 합니다.");
  }
  return errors;
}

/**
 * PR 한 건을 검사한다.
 * 입력: { body }
 * 반환: 위반 메시지 배열 (빈 배열이면 통과)
 */
export function validatePullRequest({ body }) {
  const errors = [];
  const sections = checkSections(body, 2, PR_SECTIONS, errors);
  const related = sections.find((s) => s.name === "관련 이슈");
  if (related) {
    // HTML 주석(템플릿 안내문)은 판정에서 제외한다.
    const text = related.content.replace(/<!--[\s\S]*?-->/g, "");
    // GitHub 이 인식하는 닫기 키워드(close/fix/resolve 계열)와 이 저장소의 Refs 를 대소문자 구분 없이 허용한다.
    const hasIssue = /\b(close[sd]?|fix(e[sd])?|resolve[sd]?|refs):? #\d+/i.test(text);
    const hasReason = /^이슈 없음: \S/m.test(text);
    if (!hasIssue && !hasReason) {
      errors.push(
        "`관련 이슈` 에는 `Closes #번호` 또는 `Refs #번호` 가 있어야 합니다. " +
          "오타·문구 수정처럼 이슈가 없는 변경이면 `이슈 없음: 사유` 를 적어주세요.",
      );
    }
  }
  return errors;
}
