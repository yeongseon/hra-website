# 학생 명부 등록과 승인 감사

학생 등록 화면을 개발하거나 등록 결과를 검수할 때 읽는다. **학생 명부**는 교육생 자체의 기록이고, **회원 계정**은 로그인에 쓰는 기록이다. 한 학생은 여러 기수에 등록될 수 있으며 로그인 계정과 아직 연결되지 않을 수도 있다. 같은 이름만으로 두 기록을 같은 사람으로 판단하지 않는다.

명부 목록·상세·신규 등록은 구현되어 있다. 이 문서는 지정 승인자 조건과 등록 절차를 설명하며 운영 기능을 켜라는 지시가 아니다. DB를 처음 준비한다면 [학생 스키마 적용](academic-students-migration.md)을 먼저 읽고, 등록 후 계정을 연결할 때는 [검증 연결 절차](academic-enrollment-backfill.md)를 따른다.

학생 명부 화면은 `/admin/academics/students`에 있다. 홈페이지의 `ADMIN` 역할만으로는 접근할 수 없다. 지정 승인자 검증은 #145의 `requireAcademicApprover()`가 담당하고 목록·상세·기수 조회와 등록 액션이 각각 이를 호출한다. 마이페이지의 학사관리 링크도 지정 승인자에게만 표시한다.

## 제공 기능

- 전체 또는 특정 기수의 학생 수, 계정 연결 수, 미연결 수를 집계한다. 한 학생이 여러 기수에 등록되어도 전체 학생 수는 한 명이다. 목록은 100명씩 표시한다.
- 상세에는 표시 이름, 학생 식별자, 연결 여부, 기수 등록 이력만 표시한다. 계정 이메일, 로그인 자격정보, 지원서 원문은 조회하지 않는다.
- 신규 등록은 표시 이름으로 새 학생을 생성한다. 같은 이름의 학생이 있어도 동일인으로 추정하지 않는다.
- 기존 학생의 다른 기수 등록은 정확한 학생 UUID를 요구한다. 이름 수정 입력을 함께 받지 않는다.
- 대면 확인 또는 검증된 연락 경로 확인, 별도로 관리하는 승인 근거 참조 UUID가 필요하다. 증빙·연락처 원문은 입력받지 않는다.
- 학생 수정·제외·삭제·계정 재연결은 #142 보존 정책 확정 전까지 제공하지 않는다. 계정 연결은 #145의 별도 검증 절차를 사용한다.

## 설치 및 복구

[데이터베이스 변경 절차](database-change-procedure.md)에 따라 백업·격리 검증 후 범위를 제한하여 적용한다. 먼저 #144 `scripts/migrate-academic-students.sql`을 적용하고, 이어 `scripts/migrate-academic-roster.sql`을 적용한다. 이 파일은 등록 감사 표와 `register_academic_roster` 함수를 한 트랜잭션에 설치한다. 표의 기존 구조가 다르면 중단한다. 일반 표 여부, RLS·강제 RLS 비활성, 사용자 트리거 없음, 기본 인덱스 2개의 개수와 유효·준비·생존 상태를 검사한다. `created_at`의 `now()` 외에는 열 기본값을 허용하지 않는다. 임의 자동 보정은 하지 않는다.

현재 Drizzle 스키마 정본 `src/lib/db/schema.ts`는 `academicRosterRegistrations`를 `./academic-roster`에서 재수출한다. 새 빈 개발 DB의 `db:push`로 표를 생성한 경우에도 SQL 함수를 설치하려면 이 migration을 별도 적용해야 한다.

함수는 `SECURITY INVOKER`이며 PUBLIC 실행 권한을 제거한다. 앱 연결 역할이 함수 소유자와 다르면 필요한 표 권한과 해당 함수 EXECUTE만 검토하여 부여한다. 광범위한 권한 추가는 하지 않는다.

`ACADEMIC_ENABLED`는 학사 기능의 전체 공개 설정이며 기본값은 `false`다. 정책과 학사 테이블·함수 적용을 확인한 뒤 `true`로 활성화한다. 비활성 상태에서는 지정 승인자에게 준비 안내를 제공하고 각 페이지·직접 조회·등록 액션에서 학사 DB 접근을 막는다. 레이아웃의 가드만으로 병렬 자식 실행을 막을 수 없으므로 각 진입점에서도 검사한다. 준비 안내 자체도 지정 승인자 검증을 거친다.

`ACADEMIC_APPROVER_USER_ID`에는 검증된 지정 승인자 계정 식별자를 설정한다. `ACADEMIC_ENROLLMENT_WRITES_ENABLED=true`는 명부·계정 연결의 운영 준비와 검증을 마친 후 활성화한다. 전체 공개 설정이 활성화되어 있고 쓰기 설정만 비활성인 상태에서는 조회는 가능하고 등록 페이지는 준비 안내를 표시한다. 롤백이 필요하면 이 쓰기 설정부터 비활성화한다. 이미 생성된 학적·감사를 삭제하는 rollback은 제공하지 않으며 보존 상태에서 후속 수정 migration을 검토한다.

## 원자성 및 재시도

등록 폼은 요청 UUID를 한 번 생성하고 서버 오류 이후 재시도에도 같은 값을 보낸다. 함수는 요청 키의 트랜잭션 advisory lock을 획득한 후 정규화된 입력의 SHA256 hex fingerprint를 비교한다. 동일 요청은 기존 학생·학적 식별자를 돌려주고 내용이 바뀐 요청은 거부한다. 다른 키로 같은 기존 학생을 동일 기수에 등록하면 학적 UNIQUE가 거부한다.

신규 학생·학적·최소 승인 감사는 함수 한 호출로 함께 확정된다. 학적 또는 감사 생성에 실패하면 새 학생까지 롤백한다. 감사에는 요청·행위자·학생·기수·학적 식별자, 검증 방식, 근거 참조 UUID, fingerprint, 시각만 저장한다. 표시 이름 원문은 학생 표에만 저장한다.

## 검증

`HRA_TEST_PG_BIN=/opt/homebrew/opt/postgresql@18/bin npx vitest run tests/unit/academic-roster-*.test.ts`로 입력·직접 액션 인가·쓰기 차단과 실제 격리 PostgreSQL의 카탈로그, 동명이인, 없는 참조, 중복 기수, 감사 실패 롤백, 멱등 동시 요청을 확인한다. 운영 DB 주소는 읽지 않는다.

브라우저 QA는 격리 DB와 지정 승인자 storageState 파일을 준비한 뒤 다음 환경으로 `npx playwright test tests/e2e/academic-roster.spec.ts`를 실행한다.

- `PLAYWRIGHT_BASE_URL`: 격리 앱 주소
- `HRA_ACADEMIC_QA_STATE`: 격리 승인자의 Playwright storageState JSON 파일 경로
- `HRA_ACADEMIC_QA_COHORT_ID`: 격리 기수 UUID

승인자 상태가 없는 실행은 비로그인 직접 접근 차단만 확인한다. 상태와 기수 UUID를 함께 주면 신규 등록, 목록·미연결 확인, 동일 학생 중복 기수 등록 거부, 재조회 흐름까지 실행한다. 전체 공개 및 등록 쓰기 설정은 이 격리 앱에서 모두 활성화해야 한다. 비승인 MEMBER/FACULTY/ADMIN의 실제 HTTP 접근 거부와 승인자 FACULTY의 좁은 경로 허용은 통합 QA에서 별도로 확인한다. 이 개별 Playwright 파일 전체가 기본 CI에 자동 포함되는 것은 아니며, CI의 연결 검증은 [G1 품질 게이트](academic-g1-quality-gate.md)를 따른다.

### 격리 HTTP·브라우저 실행기

`scripts/verify-academic-roster-http.mjs`는 위 준비와 검증을 자동으로 수행한다. 환경 파일이 없는 격리 worktree와 설치된 의존성, 로컬 PostgreSQL 실행 파일만 필요하다. 운영 DB 주소·OAuth·Blob 자격 증명은 읽거나 상속하지 않는다.

```bash
HRA_TEST_PG_BIN=/opt/homebrew/opt/postgresql@18/bin node scripts/verify-academic-roster-http.mjs
```

실행기는 합성 FACULTY 계정의 UUID를 `ACADEMIC_APPROVER_USER_ID`로 지정하고, 정상 CSRF·credentials 로그인으로 승인자와 비승인 ADMIN/MEMBER/FACULTY/PENDING의 실제 세션을 각각 발급한다. 테스트용 `AUTH_SECRET`과 고유한 HTTP 포트·유닉스 소켓을 실행마다 만들며 `DATABASE_URL`은 전송 어댑터가 가로채는 정확한 `.invalid` 주소로 고정한다. 앱의 인증·인가·DB 드라이버는 수정하거나 모킹하지 않는다.

다음 순서가 모두 통과해야 한다.

1. 학사 표가 없는 임시 DB에서 `ACADEMIC_ENABLED=false`로 실행한다. 지정 승인자의 목록·등록·상세 직접 요청은 준비 안내 200을 반환해야 한다. 비승인 ADMIN/MEMBER/FACULTY의 같은 요청은 403, 비로그인은 302 `/login`, PENDING은 302 `/pending`으로 거부되어야 한다. 500을 접근 차단의 성공으로 인정하지 않는다.
2. 첫 서버를 종료하고 #144 학생 명부, #145 계정 연결, #146 명부 등록 SQL migration을 순서대로 실제 적용한다. 전체 `db:push`는 실행하지 않는다.
3. `ACADEMIC_ENABLED=true`, `ACADEMIC_ENROLLMENT_WRITES_ENABLED=true`인 새 서버에서 다시 정상 로그인하고 동일한 비승인 직접 접근 차단을 확인한다.
4. 기존 `tests/e2e/academic-roster.spec.ts`의 두 테스트를 실제 Chromium으로 실행한다. 비로그인 차단과 승인자 신규 학생 등록 → 목록의 미연결 표시 → 정확한 기존 학생 UUID의 동일 기수 중복 거부 → 상세 재조회를 확인한다.
5. 실제 DB의 학생·학적·승인 감사가 각각 한 행이고 학생은 계정 미연결이며, 감사 행위자는 지정 승인자이고 기존 사용자 역할·기수·로그인 정보가 바뀌지 않았는지 확인한다. 정상 로그인 요청 제한 예약도 성공 후 삭제되어야 한다.

Playwright 쿠키 상태는 고유 임시 디렉터리 안의 0600 파일로만 전달한다. 실행 전용 설정에서 trace·스크린샷·영상을 모두 끄며, 종료 시 이 실행의 서버·임시 DB·쿠키와 브라우저 산출물을 정리한다. 출력에는 검증 이름과 통과 여부, 실패한 locator·기대 문구·소스 위치·합성 행 수만 남기고 쿠키·SQL·개인정보·원문 HTTP 헤더는 기록하지 않는다. 이 실행기를 돌리는 동안 같은 worktree에서 Next 빌드나 다른 개발 서버를 함께 실행하지 않는다.

