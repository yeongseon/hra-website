# 이슈·PR·릴리스 자동화 규칙

루트 AGENTS.md의 개발/리뷰 규칙을 유지하며, 이 디렉터리의 템플릿·워크플로는 아래 계약을 추가로 따른다.

- 이슈: 기존 한글 요약과 종류/우선순위/분류 라벨을 유지한다. 이슈 제목에 Conventional Commits를 강요하지 않는다.
- 일반 PR: `type(scope)!: 설명` 제목과 기존 네 `##` 섹션. `feat/fix/perf/revert/docs/style/refactor/test/build/ci/chore`를 사용한다. scope는 선택이고 설명은 한글을 우선한다.
- 규칙의 소유권: 이슈·일반 PR 본문은 `scripts/_lib/process-format.mjs`, PR 제목·생성형 PR·릴리스 계약은 `scripts/_lib/release-policy.mjs`다. 두 파일에 같은 검사를 복제하지 않는다.
- release-please PR: `chore(release): release X.Y.Z`. 작성자, 저장소, main 대상, 예약 브랜치, `autorelease: pending`, 변경 파일을 검증한 경우에만 생성형 본문을 허용한다. 봇 이름/라벨 하나로 전체 검사를 건너뛰지 않는다.
- `autorelease: pending` / `autorelease: tagged`는 release-please가 관리하는 **PR 전용 예약 라벨**이다. 일반 이슈의 진행 상태 라벨로 사용하거나 `P1/P2` 및 종류 라벨을 대신하지 않는다.
- 릴리스 태그는 `vX.Y.Z`; Node 단일 패키지 버전과 package-lock/manifest를 함께 갱신한다. `private: true`를 지키고 `npm publish`를 추가하지 않는다.
- `docs/chore/ci/test/build/style/refactor`만으로는 기본적으로 릴리스하지 않는다. 실제 기능/수정의 type을 자동화 사정 때문에 바꾸지 않는다. 호환성 변경은 어떤 type이든 `!`/BREAKING CHANGE로 명시한다.
- release PR은 앱 CI/독립 리뷰 면제 대상이 아니다. 자동 병합이나 관리자 승인 우회를 추가하지 않는다. 최종 squash 메시지도 검증된 PR 제목을 사용한다.
- PR 메타데이터 검사는 신뢰된 base SHA의 스크립트로 실행한다. PR 제목/본문을 `${{ }}`로 shell 코드에 직접 삽입하지 않는다. PR 코드를 쓰기 토큰으로 실행하지 않는다.
- 기존 태그/병합 커밋/닫힌 PR/과거 CHANGELOG를 일괄 재작성하지 않는다. 다른 학사 설계 PR은 이 작업과 혼합하지 않는다.
- 토큰은 최소 권한으로, 자동 생성 PR의 워크플로 승인 또는 App/PAT 연동 여부를 확인한다. 실제 설정·릴리스 생성이 미확인이라면 완료했다고 쓰지 않는다.
- 변경 후 Node 정책 테스트, 실제 릴리스 JSON 정합성 검사, 기존 Vitest/CI를 검증하고 운영 규칙은 `docs/contributing/releasing.md`와 함께 수정한다.
