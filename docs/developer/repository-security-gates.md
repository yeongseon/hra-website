# 저장소 secret·의존성 게이트

이 검사는 공개 저장소의 지속 검증이며 실제 secret의 부재나 모든 취약점의 비도달성을 증명하지 않는다. GitHub native secret scanning과 push protection의 활성화 상태는 유지한다. standalone 검사는 이 기능을 보완한다.

## Secret 검사

```bash
node scripts/scan-repository-secrets.mjs --gitleaks /absolute/path/to/gitleaks
```

Linux x64 Gitleaks **8.30.1**을 사용한다. 공식 release archive SHA256은 `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`, 압축 해제한 실행 파일 SHA256은 `88f91962aa2f93ac6ab281d553b9e125f5197bbbce38f9f2437f7299c32e5509`다. 실행기는 binary hash와 version을 다시 확인한다. [공식 release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1)의 checksum을 검증한 파일만 전달한다. Gitleaks upstream은 기능 개발을 종료하고 보안 유지보수를 제공하므로 버전 고정만으로 미래 패턴 탐지를 보장하지 않는다.

기본 엔진 규칙을 유지하고 현재 **Git 추적 파일의 작업 트리 내용**과 `--all --full-history`의 **로컬에 fetch한 reachable refs**를 각각 검사한다. shallow checkout, 누락된 이력 객체, scanner 실패, 보고서 누락/잘못된 JSON은 실패다. CI는 전체 이력을 fetch해야 한다. 삭제된 remote refs·다른 fork·미추적 파일·운영 secret 저장소까지 검사했다고 주장하지 않는다. 전체 reachable refs라 해도 과거 유출 대응을 대체하지 않는다.

합성 예외는 `tests/unit/academic-upload-server.test.ts`의 `generic-api-key` 규칙과 정확한 값의 SHA256 조합 하나뿐이다. 과거 세 도입에서 같은 `vi.stubEnv`의 명시적 fixture 표식과 `@vercel/blob` mock을 확인했다. 원문을 정책에 재기록하지 않는다. `tests/**`나 규칙 전체를 제외하지 않는다. 매 실행 때 임시 Git 저장소의 **같은 파일에 다른 새 secret**을 넣어 source 탐지하고, 삭제 commit 이후에도 history 탐지되는지 실제 엔진 canary를 통과해야 한다.

stdout에는 scope별 탐지 수·합성 예외 수·canary 결과만 쓴다. scanner stdout/stderr와 원문 JSON은 private 임시 디렉터리에서만 처리하고 정상/오류/일반 종료 신호 때 제거한다. SIGKILL/호스트 장애는 cleanup을 보장할 수 없다. CI artifact로 raw report를 업로드하지 않는다. 실제 자격정보가 의심되면 원문을 공개 이슈·댓글·로그에 붙이지 않고 비공개 보안 절차로 전달한다. 이 검사는 history rewrite나 credential 회전을 수행하지 않는다.

## 의존성 검토

```bash
node scripts/verify-dependencies.mjs
node --test scripts/tests/secret-scan.test.mjs scripts/tests/dependency-policy.test.mjs
```

실행기는 credential 환경을 전달하지 않고, 소유 임시 디렉터리의 package/lock 복사본과 비어 있는 npm 설정으로 `npm audit --json --package-lock-only --ignore-scripts`를 실행한다. registry는 `https://registry.npmjs.org`로 고정한다. exit 1의 발견과 통신/구문 오류를 구분하며 raw npm 오류는 출력하지 않는다. 설치 파일을 수정하거나 자동 업데이트하지 않는다.

`security/dependency-triage.json`은 **11 affected package**의 현재 exact metadata를 고정한다(2026-10-23 registry 재확인, 기존 항목 평가일 유지). **59 object-advisory entry**와 전이 링크를 포함한 **63 검토 항목**은 각각 다른 수다. 동일 GHSA의 여러 영향 범위/source ID도 별도로 보존한다. package nodes+lock 버전과 advisory ID/source/range 집합은 독립적이다. 모든 nodes×advisory 조합을 실제 영향 경로라고 해석하지 않는다. npm의 `dev` 값도 실제 운영 도달성을 대신하지 않는다.

2026-10-23 registry 재확인에서는 [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)가 2026-10-22에 철회된 사실을 확인했다. 공식 사유는 예외를 적절히 처리할 책임이 애플리케이션에 있다는 것이다. 이에 `sprintf-js` advisory와 `argparse` 전이 항목, `js-yaml`의 해당 전이 링크를 제거하고 집계 범위를 registry의 정확한 값으로 갱신했다. 패키지 설치 버전·검사 정책·기존 평가의 재검토 기한은 변경하지 않았다. 철회 사실은 라이브러리 사용면 전체의 안전을 보증하지 않는다.

같은 날 [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)도 실질적 악용 가능성이 없다는 공식 사유로 철회됐다. npm audit에서 `braces`와 그 권고만으로 영향받던 전이 패키지 8개가 제거된 사실을 확인해 해당 패키지 9개·평가 11건만 원장에서 삭제했다. 남은 권고와 설치 경로, lockfile, 기존 평가·기한은 유지한다. 철회된 기록을 검토 원장에 남겨 실제 registry와 어긋나게 하지 않는다.

각 항목에는 공격 조건, 사용하는 API, 호출 위치, P2 사용면 평가, 남는 전제, 유지보수 담당 `repo-maintainers`, 검토일·재검토 기한을 기록한다. 담당자 표시는 owner의 P1 위험 수용 승인이 아니다. js-yaml은 내장 기본본의 JSON_SCHEMA 파싱, Blob undici 6은 실제 fetch, jsdom undici 7은 개발 경로, glob/CSS/esbuild/Vite는 도구 입력을 따로 검토한다. 신뢰 HTTPS만으로 모든 fetch 취약점이 배제되지는 않는다. 특히 keep-alive/공급자 침해 전제는 원장에 남긴다.

새 advisory·source·범위·심각도·패키지 경로·설치 버전, 누락/잘못된 원장, 만료는 실패한다. 현재 P2는 독립 코드 검토를 거치는 사용면 평가이며 모든 high 항목을 면제하는 정책이 아니다. 운영 관련 재검토 기한은 **2026-10-29**, 도구 관련은 **2026-11-05**다. 기한 전에 패치 또는 새 근거를 검토하고 실제 재검토일과 기한을 갱신한다. 단순히 기한을 늘리지 않는다. 확인된 P1은 이 게이트에서 항상 차단하며 수정이 필요하다. 권한 있는 owner의 개별 예외가 필요하다면 별도 검토로 정책을 확장해야 하며 에이전트가 승인 사실을 만들어 통과시키지 않는다.

공식 근거: [npm audit 동작](https://docs.npmjs.com/cli/v11/commands/npm-audit/), 각 원장 항목의 GHSA ID. 원장의 source 번호와 범위는 registry 관측 시점 자료이므로 upstream advisory 변경은 재검토를 유발한다.
