/**
 * PR 제목·생성형 PR·릴리스 파일 규칙의 순수 함수.
 * 이슈/일반 PR 본문은 기존 process-format.mjs가 계속 소유한다.
 * 봇 예외는 본문에만 적용하며 제목·파일·앱 CI를 면제하지 않는다.
 */
export const COMMIT_TYPES = [
  "feat", "fix", "perf", "revert", "docs", "style", "refactor", "test", "build", "ci", "chore",
];
export const RELEASE_TITLE_PATTERN = "chore(release): release ${version}";
export const RELEASE_BRANCH = "release-please--branches--main";
export const RELEASE_FILES = [
  "CHANGELOG.md", "package.json", "package-lock.json", ".release-please-manifest.json",
];
const VERSION = "(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)";
const VERSION_RE = new RegExp(`^${VERSION}$`);
const RELEASE_TITLE_RE = new RegExp(`^chore\\(release\\): release ${VERSION}$`);
const TITLE_RE = new RegExp(`^(${COMMIT_TYPES.join("|")})(?:\\([a-z0-9][a-z0-9._/-]*\\))?!?: \\S[^\\r\\n]*$`);

/** scope는 선택이며 설명은 한국어/영어 모두 허용한다. 버전은 안정형 X.Y.Z만 사용한다. */
export function validatePullRequestTitle(title) {
  if (typeof title !== "string" || title !== title.trim() || !TITLE_RE.test(title)) {
    return ["PR 제목은 type(scope)!: 설명 형식이어야 합니다. 예: fix(auth): 카카오 로그인 오류 처리"];
  }
  return [];
}

/**
 * 입력은 GitHub API에서 읽은 PR과 변경 파일이다. 클라이언트 제목·라벨만 신뢰하지 않는다.
 * files 목록이 누락되거나 일부만 조회되면 release-please 예외를 적용하지 않는다.
 */
export function classifyPullRequest(pr, {
  repository,
  files = [],
  releaseAuthor = "github-actions[bot]",
} = {}) {
  const errors = validatePullRequestTitle(pr?.title);
  const labels = (pr?.labels ?? []).map((label) => typeof label === "string" ? label : label.name);
  const branch = pr?.head?.ref ?? "";
  const sameRepository = typeof repository === "string" && repository.length > 0 &&
    pr?.head?.repo?.full_name === repository && pr?.base?.repo?.full_name === repository;
  const mainTarget = pr?.base?.ref === "main";
  const releaseCandidate = branch.startsWith("release-please--") ||
    labels.some((label) => label?.startsWith("autorelease:")) || RELEASE_TITLE_RE.test(pr?.title ?? "");

  if (releaseCandidate) {
    const names = files.map((file) => file.filename);
    const allowedFiles = files.length > 0 && files.length === pr?.changed_files &&
      names.length === new Set(names).size &&
      names.every((name) => RELEASE_FILES.includes(name)) &&
      RELEASE_FILES.every((name) => names.includes(name)) &&
      files.every((file) => file.status === "modified" ||
        (file.status === "added" && file.filename === "CHANGELOG.md"));
    const trusted = sameRepository && mainTarget && branch === RELEASE_BRANCH &&
      pr?.user?.login === releaseAuthor && labels.includes("autorelease: pending") &&
      RELEASE_TITLE_RE.test(pr?.title ?? "") && allowedFiles &&
      typeof pr?.body === "string" && pr.body.trim().length > 0;
    if (!trusted) {
      errors.push("릴리스 PR의 작성자·동일 저장소·main 대상·예약 브랜치·제목·pending 라벨·변경 파일을 확인할 수 없습니다. 일반 PR로 위장해 예외 처리하지 않습니다.");
    }
    return { kind: trusted ? "release-please" : "standard", errors };
  }

  // Dependabot도 정확한 작성자/브랜치를 확인하고 Conventional Commit 제목은 검사한다.
  const dependabot = sameRepository && mainTarget && pr?.user?.login === "dependabot[bot]" &&
    branch.startsWith("dependabot/");
  return { kind: dependabot ? "dependabot" : "standard", errors };
}

/** 버전 숫자를 고정하지 않으므로 이후 release PR에서도 동일한 검증을 재사용한다. */
export function validateReleaseFiles({ config, manifest, packageJson, lockfile }) {
  const errors = [];
  const version = packageJson?.version;
  if (typeof version !== "string" || !VERSION_RE.test(version)) errors.push("앱 버전은 X.Y.Z 형식이어야 합니다.");
  if (packageJson?.private !== true) errors.push("웹앱은 private=true를 유지해야 합니다. npm 배포 대상이 아닙니다.");
  if (packageJson?.name !== "hra-website" || lockfile?.name !== packageJson?.name ||
      lockfile?.packages?.[""]?.name !== packageJson?.name) errors.push("패키지 이름이 일치하지 않습니다.");
  if (lockfile?.version !== version || lockfile?.packages?.[""]?.version !== version ||
      manifest?.["."] !== version) errors.push("package.json·lockfile 두 버전·manifest 버전이 일치하지 않습니다.");
  if (Object.keys(manifest ?? {}).join() !== "." || Object.keys(config?.packages ?? {}).join() !== ".") {
    errors.push("이 저장소는 루트(.) 단일 패키지 릴리스만 지원합니다.");
  }
  const root = config?.packages?.["."];
  if (root?.["release-type"] !== "node" || root?.["changelog-path"] !== "CHANGELOG.md") {
    errors.push("Node 전략과 기존 CHANGELOG.md를 사용해야 합니다.");
  }
  if (root?.["pull-request-title-pattern"] !== RELEASE_TITLE_PATTERN ||
      config?.["group-pull-request-title-pattern"] !== RELEASE_TITLE_PATTERN ||
      config?.["separate-pull-requests"] !== false) errors.push("릴리스 PR 제목/그룹 설정이 검사 규칙과 다릅니다.");
  if (config?.["include-component-in-tag"] !== false || config?.["include-v-in-tag"] !== true) {
    errors.push("릴리스 태그 형식은 vX.Y.Z여야 합니다.");
  }
  if (config?.["bump-minor-pre-major"] !== true || config?.["bump-patch-for-minor-pre-major"] !== false) {
    errors.push("0.x 기능/호환성 변경은 minor, 수정은 patch로 관리합니다.");
  }
  if (config?.["bootstrap-sha"] !== undefined && !/^[a-f0-9]{40}$/.test(config["bootstrap-sha"])) {
    errors.push("bootstrap-sha는 최초 수집 범위를 나타내는 전체 commit SHA여야 합니다.");
  }
  if (config?.["last-release-sha"] !== undefined || config?.["release-as"] !== undefined ||
      root?.["release-as"] !== undefined) errors.push("영구적인 릴리스 SHA/버전 강제 설정을 남기지 않습니다.");
  const sections = root?.["changelog-sections"] ?? [];
  if (sections.length !== COMMIT_TYPES.length || COMMIT_TYPES.some((type) =>
    sections.filter((section) => section.type === type).length !== 1)) {
    errors.push("PR type과 changelog 섹션 목록이 일치해야 합니다.");
  }
  for (const section of sections) {
    const visible = ["feat", "fix", "perf", "revert"].includes(section.type);
    if ((section.hidden !== true) !== visible) errors.push("릴리스 노출 type 정책이 다릅니다.");
  }
  return errors;
}
