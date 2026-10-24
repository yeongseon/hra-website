// @vitest-environment node
/**
 * 이슈·PR 형식 규칙 회귀 테스트
 *
 * 검증 대상 (scripts/_lib/process-format.mjs):
 *   - validateIssue: 빈 제목·종류/우선순위·핵심 본문과 완료 체크리스트 규칙
 *   - validatePullRequest: 순서와 추가 섹션에 무관한 필수 근거·이슈 연결 규칙
 *   - 규칙 상수와 이슈 폼(.github/ISSUE_TEMPLATE/*.yml)·PR 템플릿의 일치
 *
 * 마지막 항목이 중요한 이유: 폼의 섹션 이름을 바꾸고 규칙을 안 바꾸면 (또는 그 반대)
 *   웹 화면에서 정상적으로 만든 이슈가 형식 검사에 걸린다. 두 곳이 어긋나면 여기서 먼저 실패한다.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BUG_SECTIONS,
  CATEGORIES,
  PRIORITIES,
  PR_SECTIONS,
  TYPE_LABELS,
  TASK_SECTIONS,
  validateIssue,
  validatePullRequest,
} from "../../scripts/_lib/process-format.mjs";

// 섹션 이름 배열로 최소 본문을 만든다.
const makeBody = (sections: readonly string[], level = "###") =>
  sections
    .map((name) => `${level} ${name}\n\n${name === "완료 조건" ? "- [ ] 확인 조건" : "내용"}`)
    .join("\n\n");

const bugIssue = {
  title: "요약",
  labels: ["bug", "P1", "보안"],
  body: makeBody(BUG_SECTIONS),
};
const taskIssue = {
  title: "요약",
  labels: ["enhancement", "P2", "품질"],
  body: makeBody(TASK_SECTIONS),
};
const policyIssue = { title: "요약", labels: ["question"], body: makeBody(TASK_SECTIONS) };
const trackingIssue = { title: "요약", labels: ["추적"], body: "## 아무 제목\n- [ ] #12 항목" };

describe("validateIssue — 통과", () => {
  it("버그 이슈", () => {
    expect(validateIssue(bugIssue)).toEqual([]);
  });

  it("작업 이슈", () => {
    expect(validateIssue(taskIssue)).toEqual([]);
  });

  it("정책 확인 이슈는 우선순위·분류 라벨 없이 통과한다", () => {
    expect(validateIssue(policyIssue)).toEqual([]);
  });

  it("추적 이슈는 본문 구조가 자유이고 체크리스트만 있으면 된다", () => {
    expect(validateIssue(trackingIssue)).toEqual([]);
  });

  it("규칙과 무관한 라벨은 함께 있어도 된다", () => {
    expect(validateIssue({ ...bugIssue, labels: [...bugIssue.labels, "good first issue"] })).toEqual([]);
  });

  it("모든 우선순위·분류 조합이 허용된다", () => {
    for (const priority of PRIORITIES) {
      for (const category of CATEGORIES) {
        expect(validateIssue({ ...bugIssue, labels: ["bug", priority, category] })).toEqual([]);
      }
    }
  });

  it("제목 중간의 대괄호는 허용된다", () => {
    expect(validateIssue({ ...bugIssue, title: "상세 페이지 [id] 조회 오류" })).toEqual([]);
  });

  it("라벨성 접두어가 아닌 대괄호로 시작하는 제목은 허용된다", () => {
    expect(validateIssue({ ...bugIssue, title: "[id] 라우트가 404 를 반환" })).toEqual([]);
  });

  it("완료 조건은 * 로 시작하는 체크리스트도 허용한다", () => {
    const body = makeBody(BUG_SECTIONS).replace("- [ ] 확인 조건", "* [ ] 확인 조건");
    expect(validateIssue({ ...bugIssue, body })).toEqual([]);
  });

  it("코드 펜스 안의 제목 줄은 섹션으로 세지 않는다", () => {
    const body = makeBody(BUG_SECTIONS).replace(
      "### 재현 근거와 영향\n\n내용",
      "### 재현 근거와 영향\n\n```md\n### 로그에 들어 있던 제목\n```",
    );
    expect(validateIssue({ ...bugIssue, body })).toEqual([]);
  });

  it("CRLF 줄바꿈 본문도 통과한다", () => {
    expect(validateIssue({ ...bugIssue, body: makeBody(BUG_SECTIONS).replace(/\n/g, "\r\n") })).toEqual([]);
  });

  it("핵심 정보가 있으면 섹션 순서와 추가 설명 섹션은 자유롭다", () => {
    const reordered = [BUG_SECTIONS[1], BUG_SECTIONS[0], BUG_SECTIONS[2]];
    expect(validateIssue({ ...bugIssue, body: `${makeBody(reordered)}\n\n### 추가 근거\n\n합성 관찰` })).toEqual([]);
  });

  it("관련 이슈가 없으면 섹션과 관례적인 '없음' 입력을 생략한다", () => {
    const withoutRelated = makeBody(BUG_SECTIONS.slice(0, 3));
    expect(validateIssue({ ...bugIssue, body: withoutRelated })).toEqual([]);
    expect(validateIssue({ ...bugIssue, body: `${withoutRelated}\n\n### 관련 이슈\n\n_No response_` })).toEqual([]);
  });

  it("분류가 아직 없거나 제목에 기존 접두어가 있어도 핵심 라벨·본문이면 통과한다", () => {
    expect(validateIssue({ ...bugIssue, title: "[P1][보안] 요약", labels: ["bug", "P1"] })).toEqual([]);
    expect(validateIssue({ ...taskIssue, labels: ["enhancement", "P2"] })).toEqual([]);
    expect(validateIssue({ ...policyIssue, body: makeBody(TASK_SECTIONS.slice(0, 3)) })).toEqual([]);
  });
});

describe("validateIssue — 제목 위반", () => {
  it("빈 제목은 차단한다", () => {
    expect(validateIssue({ ...bugIssue, title: "   " }).length).toBeGreaterThan(0);
  });
});

describe("validateIssue — 라벨 위반", () => {
  it.each([
    ["종류 라벨 없음", ["P1", "보안"]],
    ["종류 라벨 둘", ["bug", "enhancement", "P1", "보안"]],
    ["우선순위 없음", ["bug", "보안"]],
    ["우선순위 둘", ["bug", "P1", "P2", "보안"]],
    ["분류 둘", ["bug", "P1", "보안", "검증"]],
  ])("버그: %s", (_name, labels) => {
    expect(validateIssue({ ...bugIssue, labels }).length).toBeGreaterThan(0);
  });

  it("종류 라벨이 없을 때 본문이 작업 형식이면 본문 오류는 보고하지 않는다", () => {
    const errors = validateIssue({ title: "요약", labels: [], body: makeBody(TASK_SECTIONS) });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("종류 라벨");
  });

  it("작업 이슈도 우선순위가 필요하다", () => {
    expect(validateIssue({ ...taskIssue, labels: ["enhancement"] }).length).toBeGreaterThan(0);
  });

  it("정책 확인 이슈에 우선순위·분류 라벨이 있으면 위반", () => {
    expect(validateIssue({ ...policyIssue, labels: ["question", "P2"] }).length).toBeGreaterThan(0);
    expect(validateIssue({ ...policyIssue, labels: ["question", "보안"] }).length).toBeGreaterThan(0);
  });

  it("추적 이슈에 우선순위·분류 라벨이 있으면 위반", () => {
    expect(validateIssue({ ...trackingIssue, labels: ["추적", "P1"] }).length).toBeGreaterThan(0);
  });
});

describe("validateIssue — 본문 위반", () => {
  it("버그 라벨인데 작업 섹션을 쓰면 위반", () => {
    expect(validateIssue({ ...bugIssue, body: makeBody(TASK_SECTIONS) }).length).toBeGreaterThan(0);
  });

  it("작업 라벨인데 버그 섹션을 쓰면 위반", () => {
    expect(validateIssue({ ...taskIssue, body: makeBody(BUG_SECTIONS) }).length).toBeGreaterThan(0);
  });

  it("섹션 제목 수준이 ## 이면 위반 (폼은 ### 을 만든다)", () => {
    expect(validateIssue({ ...bugIssue, body: makeBody(BUG_SECTIONS, "##") }).length).toBeGreaterThan(0);
  });

  it("핵심 섹션이 중복되면 위반", () => {
    const duplicated = `${makeBody(BUG_SECTIONS)}\n\n### 완료 조건\n\n- [ ] 중복`;
    expect(validateIssue({ ...bugIssue, body: duplicated }).length).toBeGreaterThan(0);
  });

  it("핵심 섹션이 없으면 추가 설명이 있어도 위반", () => {
    const missing = `${makeBody([BUG_SECTIONS[0], BUG_SECTIONS[2]])}\n\n### 추가 근거\n\n내용`;
    expect(validateIssue({ ...bugIssue, body: missing }).length).toBeGreaterThan(0);
  });

  it("빈 핵심 섹션과 폼의 _No response_ 는 위반", () => {
    const empty = makeBody(BUG_SECTIONS).replace("### 재현 근거와 영향\n\n내용", "### 재현 근거와 영향\n\n");
    const noResponse = makeBody(BUG_SECTIONS).replace("### 재현 근거와 영향\n\n내용", "### 재현 근거와 영향\n\n_No response_");
    expect(validateIssue({ ...bugIssue, body: empty }).length).toBeGreaterThan(0);
    expect(validateIssue({ ...bugIssue, body: noResponse }).length).toBeGreaterThan(0);
  });

  it("완료 조건이 체크리스트가 아니면 위반", () => {
    const body = makeBody(BUG_SECTIONS).replace("- [ ] 확인 조건", "확인 조건");
    expect(validateIssue({ ...bugIssue, body }).length).toBeGreaterThan(0);
  });

  it("추적 이슈에 이슈 체크리스트가 없으면 위반", () => {
    expect(validateIssue({ ...trackingIssue, body: "목록 없음" }).length).toBeGreaterThan(0);
  });

  it("본문이 null 이어도 예외 없이 위반을 보고한다", () => {
    expect(validateIssue({ ...bugIssue, body: null }).length).toBeGreaterThan(0);
  });

  it("폼의 기본값(- [ ] 뒤가 빈 체크리스트)을 그대로 두면 위반", () => {
    const body = makeBody(BUG_SECTIONS).replace("- [ ] 확인 조건", "- [ ] ");
    expect(validateIssue({ ...bugIssue, body }).length).toBeGreaterThan(0);
  });

  it("위반 메시지에 실리는 섹션 이름은 멘션·링크 문자를 제거하고 길이를 줄인다", () => {
    const body = `### @someone [링크](https://example.com) ${"가".repeat(200)}\n\n내용`;
    const message = validateIssue({ ...bugIssue, body }).join("\n");
    expect(message).not.toContain("@someone");
    expect(message).not.toContain("https://example.com)");
    expect(message.length).toBeLessThan(600);
  });
});

describe("validatePullRequest", () => {
  const prBody = (related: string) =>
    makeBody(PR_SECTIONS, "##").replace("## 관련 이슈\n\n내용", `## 관련 이슈\n\n${related}`);

  it.each(["Closes #12", "Refs #12", "closes #12", "Fixes #12", "Resolves: #12", "이슈 없음: 문구 오타 수정"])(
    "통과: %s",
    (related) => {
      expect(validatePullRequest({ body: prBody(related) })).toEqual([]);
    },
  );

  it("PR 필수 근거가 있으면 섹션 순서와 추가 검토 섹션은 자유롭다", () => {
    const reordered = [PR_SECTIONS[2], PR_SECTIONS[0], PR_SECTIONS[3], PR_SECTIONS[1]];
    const body = `${makeBody(reordered, "##").replace("## 관련 이슈\n\n내용", "## 관련 이슈\n\nCloses #12")}\n\n## 추가 검토\n\n범위`;
    expect(validatePullRequest({ body })).toEqual([]);
  });

  it("검증 근거가 빈 PR은 순서와 관계없이 차단한다", () => {
    expect(validatePullRequest({ body: prBody("Refs #12").replace("## 검증 결과\n\n내용", "## 검증 결과\n\n_No response_") }).length).toBeGreaterThan(0);
  });

  it("PR 핵심 근거 섹션을 중복하면 차단한다", () => {
    expect(validatePullRequest({ body: `${prBody("Closes #12")}\n\n## 검증 결과\n\n중복` }).length).toBeGreaterThan(0);
  });

  it("이슈 번호도 사유도 없으면 위반", () => {
    expect(validatePullRequest({ body: prBody("관련 없음") }).length).toBeGreaterThan(0);
  });

  it("템플릿을 채우지 않은 `Closes #번호` 는 위반", () => {
    expect(validatePullRequest({ body: prBody("Closes #번호") }).length).toBeGreaterThan(0);
  });

  it("주석 안의 안내문만으로는 통과하지 않는다", () => {
    expect(validatePullRequest({ body: prBody("<!-- Refs #12 로 바꿔주세요 -->") }).length).toBeGreaterThan(0);
  });

  it("섹션을 지우면 위반", () => {
    expect(validatePullRequest({ body: "## 관련 이슈\n\nCloses #1" }).length).toBeGreaterThan(0);
  });

  it("본문이 비어 있으면 위반", () => {
    expect(validatePullRequest({ body: null }).length).toBeGreaterThan(0);
  });
});

describe("규칙과 템플릿의 일치", () => {
  // 이슈 폼 YAML 에서 textarea 의 label 값만 순서대로 뽑는다.
  const formLabels = (file: string) =>
    [...readFileSync(`.github/ISSUE_TEMPLATE/${file}`, "utf8").matchAll(/^ {6}label: (.+)$/gm)].map((m) => m[1]);
  const formField = (file: string, key: string) =>
    readFileSync(`.github/ISSUE_TEMPLATE/${file}`, "utf8").match(new RegExp(`^${key}: (.+)$`, "m"))?.[1];

  // 폼은 종류 라벨을 붙이고, 버그·작업 폼은 기본 우선순위 P2 도 붙인다. 폼의 제목 접두어는 없어야 한다.
  it("버그 폼의 섹션과 라벨", () => {
    expect(formLabels("bug.yml")).toEqual([...BUG_SECTIONS]);
    expect(formField("bug.yml", "labels")).toBe('["bug", "P2"]');
    expect(formField("bug.yml", "title")).toBeUndefined();
  });

  it("작업 폼의 섹션과 라벨", () => {
    expect(formLabels("task.yml")).toEqual([...TASK_SECTIONS]);
    expect(formField("task.yml", "labels")).toBe('["enhancement", "P2"]');
    expect(formField("task.yml", "title")).toBeUndefined();
  });

  it("정책 확인 폼의 섹션과 라벨", () => {
    expect(formLabels("policy.yml")).toEqual([...TASK_SECTIONS]);
    expect(formField("policy.yml", "labels")).toBe('["question"]');
    expect(formField("policy.yml", "title")).toBeUndefined();
  });

  it("폼이 붙이는 라벨은 모두 규칙에 정의된 라벨이다", () => {
    const known = [...TYPE_LABELS, ...PRIORITIES, ...CATEGORIES];
    for (const file of ["bug.yml", "task.yml", "policy.yml"]) {
      const labels: string[] = JSON.parse(formField(file, "labels") ?? "[]");
      for (const label of labels) expect(known).toContain(label);
    }
  });

  it("PR 템플릿의 섹션", () => {
    const headings = [...readFileSync(".github/PULL_REQUEST_TEMPLATE.md", "utf8").matchAll(/^## (.+)$/gm)].map(
      (m) => m[1],
    );
    expect(headings).toEqual([...PR_SECTIONS]);
  });

  it("웹 이슈 폼은 관련 이슈에 관례적 없음이나 필수 입력을 요구하지 않는다", () => {
    for (const file of ["bug.yml", "task.yml", "policy.yml"]) {
      const form = readFileSync(`.github/ISSUE_TEMPLATE/${file}`, "utf8");
      const related = form.slice(form.indexOf("    id: related"));
      expect(related).toContain("required: false");
      expect(related).not.toContain("value: 없음");
    }
  });

  it("문서·폼·AGENTS 에 모든 분류와 우선순위가 적혀 있다", () => {
    const doc = readFileSync("docs/contributing/workflow.md", "utf8");
    const agents = readFileSync("AGENTS.md", "utf8");
    const bugForm = readFileSync(".github/ISSUE_TEMPLATE/bug.yml", "utf8");
    const taskForm = readFileSync(".github/ISSUE_TEMPLATE/task.yml", "utf8");
    // 분류 목록 줄: "보안 / 무결성 / …" 형태로 순서대로 적혀 있어야 한다.
    const slashList = CATEGORIES.join(" / ");
    expect(bugForm).toContain(slashList);
    expect(taskForm).toContain(slashList);
    expect(agents).toContain(CATEGORIES.map((category) => `\`${category}\``).join(" / "));
    for (const category of CATEGORIES) {
      // 문서의 분류 표는 첫 칸에 `분류` 를 백틱으로 적는다.
      expect(doc).toContain(`| \`${category}\` |`);
    }
    for (const priority of PRIORITIES) {
      expect(doc).toContain(`\`${priority}\``);
      expect(agents).toContain(`\`${priority}\``);
    }
  });
});
