<!-- 제목: type(scope)!: 설명. 예: fix(auth): 카카오 로그인 오류 처리
     이슈 제목의 P1/P2 라벨은 버전 증가 종류가 아닙니다.
     일반 PR은 아래 네 핵심 섹션을 채웁니다. 순서 변경과 보조 섹션은 허용합니다.
     release-please/Dependabot은 검증된 생성형 본문을 사용합니다.
     상세: docs/contributing/releasing.md -->
## 관련 이슈

Refs #번호
<!-- 병합으로 모든 완료 조건이 충족될 때만 Closes #번호.
     배포/마이그레이션/운영 확인이 남으면 Refs #번호를 유지합니다.
     단일 오타처럼 이슈가 없으면 "이슈 없음: 사유"를 적습니다. -->

## 변경 내용

- 변경한 내용:
- 호환성 변경: 없음 / 내용 기재 (있으면 제목에 ! 및 아래 BREAKING CHANGE 설명)

## 검증 결과

| 확인 항목 | 결과 또는 미실행 사유 |
| --- | --- |
| `npm run lint` | |
| `npm run typecheck` | |
| `npm test` | |
| `npm run build` | |
| `node --test scripts/tests/release-policy.test.mjs` (자동화 변경 시) | |
| `node scripts/check-release-config.mjs` (릴리스 설정 변경 시) | |
| 수동 확인·`npm run test:e2e` (해당 시) | |

## 배포 영향과 리뷰

- DB 마이그레이션·Blob·권한·환경변수 영향: 없음 / 내용 기재
- AGENTS.md §11 Oracle 리뷰 대상: 아니요 / 예 — 실제 결과 또는 미실행 사유
- 남은 위험 또는 후속 이슈: 없음 / 이슈 번호 기재
- squash 병합 제목이 이 PR의 검증된 제목과 일치하는지 확인합니다.
<!-- 호환성 변경이 있으면 주석 밖에 BREAKING CHANGE: 사유와 이전 방법을 적고
     squash 커밋 본문에도 보존하세요. 로컬 lint/CI/독립 리뷰를 생략하지 않습니다. -->
