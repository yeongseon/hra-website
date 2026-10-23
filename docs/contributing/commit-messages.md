# 커밋 메시지 규칙

커밋 제목은 Conventional Commits 형식으로 작성합니다.

형식: `type(scope): 변경 내용` (호환성이 깨지면 `type(scope)!: ...`)

- Type은 `feat`, `fix`, `perf`, `revert`, `docs`, `style`, `refactor`, `test`, `build`, `ci`, `chore` 중에서 선택합니다.
- Scope는 선택 사항이며 영어 소문자·숫자·하이픈을 사용합니다.
- 제목은 변경 사항을 구체적으로 한글로 설명합니다.
- 본문에는 변경 이유와 중요한 제약만 남깁니다. CI 실행 번호나 임시 리뷰 평가값은 PR 검증 결과에 기록합니다.
- 호환성이 깨지는 수정은 `BREAKING CHANGE:` 설명을 추가합니다.
- GitHub 기본 Merge 커밋은 PR 연결 추적을 위해 예외로 허용합니다.

예: `ci(monitoring): 배포 후 공개 응답 검사 추가`
예: `fix(auth): 권한 회수 후 세션 인가 재검증`

기존 main 히스토리를 재작성하기 전에는 백업·태그·릴리스 앵커·배포 참조를 확인합니다.
