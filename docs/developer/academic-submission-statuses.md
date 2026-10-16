# 과제별 제출·미제출 현황과 CSV

#156은 지정된 학사 운영 책임자가 공개 당시 대상 전원의 최종 제출 여부를 확인하는 기능이다. 학생 개인 과제와 기존 공동 자료실의 정책은 변경하지 않는다. 운영 활성화와 개인정보 보존 결정 #142는 별도이며 이 기능이 활성화 설정을 자동으로 변경하지 않는다.

## 진입점과 권한

- 페이지: `/admin/academics/assignments/[id]/submissions` — 공개·종료 과제 상세의 **대상별 제출 현황**에서 이동한다.
- CSV: `/api/academic/assignments/[id]/submissions/export`
- 서버 쿼리: `listAssignmentSubmissionStatuses(input)`와 `exportAssignmentSubmissionStatuses(input)`

두 쿼리는 요청마다 기존 `requireAcademicApprover()`로 실제 세션과 정확한 `ACADEMIC_APPROVER_USER_ID` 일치를 확인하고, 이어 `ACADEMIC_ENABLED=true`를 확인한 후 입력 검증과 DB 조회를 수행한다. 일반 ADMIN·MEMBER·FACULTY, PENDING, 비로그인은 거부한다. 서버가 확인한 actor UUID와 현재 설정 approver UUID를 SQL에 각각 바인딩하며 같은 SQL snapshot에서 현재 users 역할도 ADMIN/FACULTY/MEMBER인지 재검증한다. auth 이후 PENDING 변경·계정 삭제가 먼저 커밋되면 명단/CSV를 빈 성공으로 반환하지 않고 403으로 거부한다. 운영 책임자로 명시 지정한 FACULTY는 허용한다. 홈페이지 ADMIN 역할만으로 CSV를 허용하지 않는다. 설정 누락도 차단한다.

미승인 요청은 403, 기능 비활성·없는 과제·다른 기수·초안·미래 공개는 404, 잘못된 필터는 422, DB 장애는 고정 한국어 503이다. 페이지의 미승인 응답은 로그인으로 이동한다. CSV 오류에도 `private, no-store`를 적용하며 첨부파일 헤더나 원본 오류/개인정보를 반환하지 않는다. 관리자 경로의 상위 권한 경계는 #146의 별도 학사 라우트 그룹 및 좁은 auth 예외와 함께 사용한다.

## 공개 당시 분모와 같은 SQL snapshot

`assignment_targets`를 기준으로 학적·학생 이름을 연결하고 최종 `assignment_submissions`를 LEFT JOIN한다. 현재 로그인 계정 연결이나 현재 활성 학적을 WHERE 조건으로 사용하지 않는다. 따라서 미로그인·계정 미연결·공개 후 등록 종료 학생도 원래 분모에 남는다. 과제 공개 후 등록된 학생은 기존 과제 대상에 자동 추가하지 않는다. 임시 업로드·검증된 업로드 의도만으로 제출로 집계하지 않는다.

한 SQL에 과제 정의, 대상 CTE, 전체 집계, 필터, 정렬, 페이지를 둔다. 이 SQL의 MVCC snapshot에서 전체 대상 N·제출 S·미제출 N-S와 표시 행이 함께 결정된다. 동시 제출이 커밋되더라도 동일 응답 안의 카운트와 행이 서로 다른 시점을 섞지 않는다. 다음 새로고침에서는 새 커밋이 반영된다. 검색·제출 필터를 적용해도 상단 전체 분모는 바뀌지 않고 별도 `filteredCount`가 검색 결과 수를 나타낸다.

DTO는 과제 식별/제목/기수/상태, 전체 카운트, 필터 수, 대상별 `{ targetId, displayName, accountLinked, enrollmentActive, submittedAt }`다. 이름 이외의 학생 개인정보, 이메일, 계정 ID, 저장 키/URL, 파일·멱등 키는 선택하지 않는다. 화면은 이름·등록 표시·제출 여부·한국시간 제출 시각만 표시하며 파일 링크를 임의로 구성하지 않는다. 파일 접근은 별도 인증 API #153/#154의 계약에 따른다.

## 조회 조건

| 필드 | 계약 |
| --- | --- |
| `assignmentId` | 필수 과제 UUID. URL 경로에서 결정한다. |
| `cohortId` | 선택 기수 UUID. 과제 기수와 정확히 일치해야 하며 다른 기수는 404다. |
| `status` | `ALL` / `SUBMITTED` / `UNSUBMITTED`. 기본 전체. |
| `search` | 앞뒤 공백 제거 후 최대 100자. 이름의 대소문자 구분 없는 부분 문자열이며 `%`와 `_`는 와일드카드가 아니다. |
| `sort` / `direction` | `name` 또는 `submittedAt`, `asc` 또는 `desc`. NULL 시각은 마지막. 모든 정렬에 대상 UUID ASC를 최종 tie-breaker로 둔다. |
| `page` / `pageSize` | 기본 1/30, 최대 페이지 10,000·페이지 크기 100. |

미지원 필드·중복 URL 쿼리를 조용히 무시하지 않고 422로 처리한다. 검색어와 정렬을 SQL 문자열로 연결하지 않으며 값은 바인딩, 정렬은 정해진 SQL 조각만 사용한다. 페이지 간 조회 사이에 새 제출이 생겨 제출시각 정렬 순서가 바뀔 수는 있다. 동일 snapshot의 안정된 ID tie-breaker는 동명이인·동일 시각의 비결정적 누락/중복을 방지한다.

## CSV 계약

CSV는 현재 검색·상태·기수 필터 전체를 내보낸다. 화면 페이지 번호/크기는 내보내기 범위를 제한하지 않는다. 한 번에 최대 10,000행이며 초과하면 조용히 자르지 않고 422로 거부한다. 범위를 줄여 다시 요청한다.

필드는 **이름·제출 상태·제출 시각(한국시간)** 세 개다. UTF-8 BOM을 앞에 붙여 Excel의 한글 인식을 돕고 줄바꿈은 CRLF다. 모든 필드를 큰따옴표로 인용하고 내부 따옴표를 두 번 쓴다. 수식 시작 `= + - @` 및 앞선 공백/제어 문자, 선행 탭·개행은 작은따옴표 접두어로 무력화한다. 미제출 시각은 빈 값이다. 날짜는 서버 시간대와 관계없이 Asia/Seoul의 `YYYY-MM-DD HH:mm:ss`다.

첨부 파일명은 제목의 경로 구분자·헤더 제어 문자를 제거하고 길이를 제한한 뒤 `filename*`로 인코딩한다. ASCII 대체 파일명도 함께 제공한다. 정상·오류 응답 모두 `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`를 적용한다. 변경 코드에는 민감 자료 로깅을 추가하지 않는다.

## 검증과 적용

```sh
HRA_TEST_PG_BIN=/opt/homebrew/opt/postgresql@18/bin npx vitest run tests/unit/academic-submission-statuses*.test.ts
npx playwright test tests/e2e/academic-submission-statuses.spec.ts --workers=1
npm run typecheck
```

단위/API는 지정 승인자와 일반 역할, 명시 지정 FACULTY, 기능 gate 순서, 입력·오류, CSV BOM/한국시간/수식/인용/파일명/최소 필드를 검증한다. 실제 격리 PostgreSQL에서는 신규 선행 스키마 #144/#147/#148을 적용한 뒤 운영 서비스의 SQL을 그대로 실행한다. N=0, S=0, S=N, 미연결·종료·추가등록, 기수/검색/필터/페이지/tie-breaker와 동시 제출 커밋 중의 일관된 snapshot을 확인한다. E2E는 운영 DB/Blob 없이 실제 Next의 비로그인 페이지 및 CSV 직접 호출 거부를 확인한다. 승인자 브라우저 플로우는 #146/#155 통합 QA에서 기존 학사 권한 경계와 함께 확인한다.

이 구현은 새 스키마를 추가하지 않는다. `academic-assignments.ts`/`academic-submissions.ts`와 해당 SQL은 선행 작업 사본이며 변경하지 않는다. root schema·학사 레이아웃·목록 화면 #155는 통합 담당 작업에서 관리한다.
