# PR 규칙과 release-please 릴리스 운영

관련: #168. 웹앱 기능/학적/DB/배포 정책이 아니라 **변경 이력과 버전 관리**를 다룬다.

**릴리스(release)**는 특정 코드 상태에 버전과 변경 설명을 붙여 기록하는 일이다. **태그(tag)**는 그 코드 상태를 가리키는 이름이고, **배포(deploy)**는 프로그램을 서버에서 제공하는 일이다. 태그를 만들었다고 DB 변경이나 운영 확인까지 완료되는 것은 아니다.

일반 기여자는 PR 제목·본문과 변경 설명을 확인한다. 저장소 관리자는 release-please 활성화·토큰·첫 릴리스 결과를 확인한다. **release-please**는 병합된 변경 이력을 읽고 버전·CHANGELOG 변경을 PR로 제안하는 도구다.

## 1. 이슈 → PR → 릴리스의 역할

| 대상 | 형식 | 예 |
| --- | --- | --- |
| 이슈 제목 | 한글 요약, 종류/우선순위/분류는 라벨 | 카카오 로그인 실패 후 재시도 가능하게 처리 |
| 일반 PR 제목 | `type(scope)!: 설명` | `fix(auth): 카카오 로그인 오류 처리` |
| 일반 PR 본문 | 기존 네 `##` 섹션 | 관련 이슈 / 변경 내용 / 검증 결과 / 배포 영향과 리뷰 |
| release-please PR | `chore(release): release X.Y.Z` + 생성형 본문 | `chore(release): release 0.1.1` |
| 태그 | `vX.Y.Z` | `v0.1.1` |

이슈의 `P0/P1/P2`는 **업무 우선순위**, `feat/fix/!`는 **릴리스 영향**이다. P1 버그가 반드시 major 릴리스인 것은 아니다. 이슈 제목을 전부 `feat:`/`fix:`로 바꾸지 않는다.

## 2. PR 제목과 버전

버전 `X.Y.Z`는 차례로 major·minor·patch이다. 보통 호환성을 깨는 변경, 기능 추가, 수정의 크기를 구분한다. 현재 0.x 단계에서는 아래 저장소 설정에 따라 증가 폭을 정한다. 업무의 긴급도와는 별개다.

| type | 의미 | 기본 릴리스 영향 |
| --- | --- | --- |
| `feat` | 새 기능 | minor |
| `fix` | 버그 수정 | patch |
| `perf` | 성능 개선 | patch |
| `revert` | 배포된 동작 되돌림 | patch (영향은 별도 검토) |
| `docs`, `style`, `refactor`, `test`, `build`, `ci`, `chore` | 문서/구조/테스트/도구 변경 | 단독 비호환 변경이 없으면 릴리스하지 않음 |
| 모든 type의 `!` 또는 `BREAKING CHANGE:` | 사용자/운영 계약의 호환성 변경 | 0.x에서는 minor, 1.x 이상에서는 major |

scope는 `auth`, `academic`, `attendance`, `upload`, `ci`, `release`처럼 변경 대상을 짧게 쓴다. scope 없는 `fix: ...`도 허용한다. 설명은 한글을 우선하며, 영문 타입만 소문자로 고정한다. 형식이 맞는다고 변경 내용의 의미까지 자동 검증되는 것은 아니므로 리뷰가 필요하다.

일반 PR은 **squash merge**, 즉 브랜치의 변경을 한 커밋으로 묶어 병합하는 방식을 기본으로 운영한다. **최종 squash commit 제목이 검증된 PR 제목이어야 release-please가 올바르게 분류한다.** 커밋 목록 전체를 무조건 본문에 넣지 말고, 필요한 설명·이슈 참조·BREAKING CHANGE를 보존한다. 작업 브랜치의 임시(WIP) 커밋마다 Conventional Commits를 강제하지는 않는다.

권장 GitHub 설정(관리자 확인 필요): squash 허용, 기본 squash 제목=PR 제목, 기본 본문=PR 본문. Merge/rebase 사용을 계속 허용하면 모든 main 유입 커밋의 형식과 의미를 별도로 점검해야 한다. 이 변경은 저장소 설정을 자동 수정하지 않는다.

## 3. 최초 도입과 버전 정본

**Manifest(매니페스트)**는 패키지별 기준 버전을 기록하는 파일이다. **bootstrap-sha**는 최초 도입 시 과거 이력을 어디까지 이미 처리한 것으로 볼지 정하는 커밋 ID다. 기준 설정은 `release-please-config.json`과 `.release-please-manifest.json`에 있다.

- 현재 package 버전 **0.1.0**을 `.release-please-manifest.json`의 기준으로 사용한다. 이미 공개한 릴리스가 있다는 뜻이 아니다.
- 도입 직전 main `b6b5f7d1608d14e0f647b0929211ceec5db855b2`을 `bootstrap-sha`로 지정했다. 이 커밋까지의 과거 변경 이력은 재수집하지 않는다.
- 기존 `CHANGELOG.md`는 그대로 보존하고 이후 버전 항목을 release-please가 추가한다. 과거 PR/커밋/태그를 재작성하지 않는다.
- 다음 실질 변경이 `fix:`면 보통 0.1.1, `feat:`면 0.2.0을 제안한다. 설정 도입 `ci:`/문서 `docs:`만으로 첫 release PR이 안 생겨도 정상이다.
- 첫 성공적인 release PR 이후 `bootstrap-sha`는 필요 없어져 별도 작은 PR에서 제거할 수 있다. `last-release-sha`로 매번 고정하지 않는다.
- package.json, package-lock.json 상위 버전, lockfile `packages[""].version`, manifest `"."` 버전은 일치해야 한다. `node scripts/check-release-config.mjs`로 검사한다.
- 1.0.0 전환은 제품의 호환성 약속과 운영 준비를 검토한 뒤 별도 결정한다. 상시 `release-as`를 설정해 자동 증가를 망가뜨리지 않는다.

## 4. 릴리스 흐름

1. 일반 PR의 제목/본문·앱 CI·리뷰를 확인하고 main에 squash merge한다.
2. 저장소 변수 `RELEASE_PLEASE_ENABLED=true`로 활성화한 뒤 `Release Please` workflow가 변경을 분석하여 하나의 release PR을 생성/갱신한다. 기본 상태에서는 job이 건너뛰어지며 npm publish·DB migration·Vercel 배포 명령은 실행하지 않는다.
3. release PR의 버전, 포함된 변경, CHANGELOG, 네 버전값을 검토한다. 릴리스 설명에는 미구현 기능을 완료로 표시하지 않는다.
4. `PR 형식`, `형식·릴리스 계약 테스트`, 기존 앱 CI 및 필요한 리뷰가 통과했는지 확인한다. 메타데이터 검사 성공은 앱 빌드 성공이 아니다.
5. 사람이 release PR을 병합하면 다음 실행에서 GitHub Release와 태그를 생성한다. 자동 병합은 구성하지 않는다.
6. 버전/태그/Release/CHANGELOG 일치 여부를 확인한다. Vercel은 기존 Git 연동 배포를 계속 사용하며, 태그 생성만을 배포 기준으로 바꾸지 않았다.

이 workflow의 수동 실행은 main에서만 허용한다. 실패 시 기존 release PR을 확인하고 재실행한다. 상태 라벨을 임의로 지우거나 동일 버전의 수동 태그를 만들지 않는다. 잘못 공개된 버전은 이력 삭제보다 수정 릴리스를 우선한다.

## 5. 토큰과 CI 실행

**PAT(Personal Access Token)**는 GitHub 작업 권한을 부여하는 비밀 토큰이다. **fine-grained** 토큰은 대상 저장소와 허용 작업을 제한할 수 있다. 실제 토큰 값은 저장소의 Actions Secret으로 관리하며, PR 본문이나 로그에 적지 않는다.

활성화 전 저장소 한정 `RELEASE_PLEASE_TOKEN`(최소 권한 fine-grained PAT)을 설정한다. release-please에는 contents/issues/pull-requests 쓰기 권한이 필요하다. `GITHUB_TOKEN`으로 대체하지 않는다. 워크플로별 최소 권한을 사용하고 DB/Blob/배포 토큰은 전달하지 않는다. GitHub App을 사용하려면 별도 단계에서 단기 설치 토큰을 발급하도록 workflow를 변경해야 한다.

관리자 설정의 **Allow GitHub Actions to create and approve pull requests**는 `GITHUB_TOKEN`의 PR 생성·승인 권한을 제어한다. 현재 workflow가 사용하는 별도 PAT의 저장소 권한과 구분한다. 이 옵션만 켠다고 PAT 권한이 생기는 것은 아니다. 조직 정책과 실제 토큰의 허용 범위를 확인하며, workflow는 PR 승인·병합을 수행하지 않는다. 설정의 적용 대상은 [GitHub 공식 안내](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)를 따른다.

2026-10-18에 확인한 [GitHub 공식 문서](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)는 `GITHUB_TOKEN`의 후속 실행 제한에 예외를 설명한다. `pull_request`의 `opened`·`synchronize`·`reopened` 이벤트는 **사용자 승인 대기 상태의 workflow**를 만들 수 있다. 다른 PR 활동과 태그의 push 등은 같은 예외가 아니므로, “GITHUB_TOKEN이면 모든 CI가 자동 실행된다”거나 “PR CI를 전혀 실행할 수 없다”고 단정하지 않는다.

현재 저장소 workflow는 여전히 `RELEASE_PLEASE_TOKEN`을 필수로 요구한다. 토큰 방식을 바꾸려면 작성자 검증과 CI 시작·승인 절차를 함께 검토하는 별도 변경이 필요하다. 첫 release PR에서는 실제 작성자·필수 검사·실행 결과를 확인하고, 별도 승인 정책이 적용되면 승인 후 CI를 확인한다.

저장소 변수 `RELEASE_PLEASE_BOT_LOGIN`에 실제 PR 작성자 login을 정확히 지정한다. 토큰 자체를 변수나 문서에 기록하지 않는다. 대상 저장소 정책·토큰 권한·작성자 변수·CI 실행 방법을 확인한 뒤에만 `RELEASE_PLEASE_ENABLED=true`로 전환한다.

## 6. 생성형 PR 예외와 재발 방지

릴리스 PR은 다음 조건을 모두 만족해야만 수동 본문 템플릿을 면제한다.

- 신뢰된 작성자, 작업 브랜치와 병합 대상이 같은 저장소, main 대상
- 정확한 `release-please--branches--main` 브랜치
- `chore(release): release X.Y.Z` 제목과 `autorelease: pending` 라벨
- 변경 파일 전체가 CHANGELOG.md, package.json, package-lock.json, .release-please-manifest.json 네 파일이며 삭제/이름 변경 없음

`autorelease: pending`, `autorelease: tagged`는 **릴리스 PR 전용 예약 라벨**이며 일반 이슈 상태 라벨은 계속 만들지 않는다. 사람 PR에 봇 라벨만 붙이거나 `chore(release)`라고 쓰는 것으로 예외를 얻을 수 없다. 생성형 본문 예외가 코드/권한/CI 면제는 아니다.

Dependabot도 정확한 작성자와 `dependabot/` 브랜치를 확인하며 **제목은 검사**한다. 향후 Dependabot 도입 시 Conventional Commit 제목을 만들도록 `commit-message.prefix`를 `chore` 등으로 설정한다. 모든 봇 PR을 통째로 건너뛰지 않는다.

본문 규칙의 정본은 `scripts/_lib/process-format.mjs`; 제목·생성형 PR·버전 정책 정본은 `scripts/_lib/release-policy.mjs`다. 제목 검사는 trusted base SHA 코드를 사용하고 변경된 정책 자체는 별도의 읽기 전용 job에서 테스트한다. Node 기본 테스트라 문서/정책 검사에 npm install·운영 비밀값이 필요하지 않다.

## 7. 일괄 점검과 활성화 체크리스트

```bash
npm run issues:check                               # 기존 열린 이슈 검사
node scripts/check-process-format.mjs --pull-requests
node scripts/check-process-format.mjs --all         # 둘 다, 읽기 전용
node --test scripts/tests/release-policy.test.mjs
node scripts/check-release-config.mjs
```

실제 GitHub 점검은 gh CLI 로그인과 저장소 read 권한이 필요하다. Actions의 `이슈·PR 형식` 수동 실행도 일괄 점검을 제공한다. 위반 항목만 필요한 범위에서 고치고 의미·우선순위·담당자를 자동으로 바꾸지 않는다. 닫힌 이슈/PR은 형식 통일만을 이유로 재작성하지 않는다.

- [ ] 도입 PR의 CI와 코드 리뷰 확인
- [ ] 대상 저장소의 Actions·토큰 정책과 PAT의 저장소 범위·권한 확인
- [ ] `RELEASE_PLEASE_TOKEN`·작성자 변수·CI 승인 방법 확인 후 `RELEASE_PLEASE_ENABLED=true` 설정
- [ ] squash 기본 메시지와 main 보호/필수 체크 설정 확인
- [ ] 첫 release PR의 작성자·파일·버전·CI 실행 검증
- [ ] release PR 병합 뒤 GitHub Release와 태그의 버전 일치 검증

코드가 병합되었다는 것과 최초 운영 릴리스까지 검증되었다는 것을 구분한다. 운영 확인 전에는 #168을 자동으로 닫지 않는다.

## 공식 참고 자료

- [release-please Action](https://github.com/googleapis/release-please-action)
- [Manifest와 bootstrap](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md)
- [워크플로가 다른 워크플로를 실행할 때의 토큰 동작](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
- [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)

