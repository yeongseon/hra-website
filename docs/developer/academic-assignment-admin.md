# 지정 승인자의 과제 관리 화면

`/admin/academics/assignments`에서 과제를 조회하고 초안을 등록·수정한다. 홈페이지 관리자 역할만으로 권한을 얻지 않는다. 각 페이지와 조회 함수가 지정 승인자를 독립적으로 검사한다. 실제 데이터 SQL도 서버에서 얻은 행위자·지정 계정 ID와 현재 승인 역할을 같은 문장에서 확인한다. 인증 뒤 역할이 철회되면 빈 목록이나 0명으로 성공하지 않고 고정 한국어 메시지와 `status=403`인 조회 오류로 거부한다. 변경은 #149의 서버 액션과 SQL 원자 변경을 사용한다.

## 준비 상태

전체 공개 설정 `ACADEMIC_ENABLED`는 #142 정책 및 운영 준비 확인 전 비활성으로 유지한다. 화면은 해당 설정을 승인자 확인 뒤 검사하며, 비활성 시 학사 DB를 조회하지 않는다. 공개 설정이 켜져도 실제 과제·대상·제출 테이블과 변경 함수가 없으면 준비 안내를 표시한다. 미준비 제출 수를 0으로 대체하지 않는다.

`ACADEMIC_ENROLLMENT_WRITES_ENABLED`는 별도 쓰기 중단 설정이다. 비활성 시 조회는 유지하고 저장·공개·종료 입력을 비활성화한다. 서버 액션도 같은 설정을 검사한다. 화면에는 설정명·DB 내부 오류·원본 쿼리를 노출하지 않는다.

## 운영 흐름

1. 기수를 고르고 해당 기수의 수업과 세부 수업을 선택한다. 수업 연결은 생략할 수 있다. 다른 기수로 변경하면 이전 수업 선택을 지운다.
2. 제목·안내·마감을 저장한다. 마감 입력·표시는 브라우저 현지 시간대와 관계없이 한국시간이다. 초안은 마감 미정으로 저장할 수 있다.
3. 상세의 공개 대상 확인으로 이동한다. 대상 기수, 공개 예정 대상 수, 현재 계정 미연결 수, 한국시간 마감과 확인 시각을 검토한다.
4. 공개 확인 시 서버의 초안 버전과 대상 fingerprint를 보낸다. 원자 변경이 실제 공개 스냅샷을 만든 뒤 fingerprint를 비교하며 명부가 바뀌었으면 공개와 감사를 모두 롤백한다. 최신 대상으로 다시 확인한 뒤 재시도한다.
5. 공개된 과제는 기수·수업·제목·안내·마감을 편집하거나 삭제할 수 없다. 최초 확정 대상수와 실제 제출수만 조회한다. 종료 후에는 학생의 추가 제출을 받지 않는다.

대상은 같은 기수의 `ENROLLED`, `ended_at IS NULL`, 등록·생성 시각이 기준 시각 이하인 학적이다. 미리보기는 서버 `clock_timestamp()` 한 번을 기준으로 계산한다. 계정 미연결 학생도 포함되며 공개 후 새로 등록한 학생은 자동 추가되지 않는다. 대상 fingerprint는 enrollment UUID를 오름차순으로 정렬한 소문자 문자열을 쉼표로 연결하고 SHA256 hex로 계산한다. 빈 집합은 빈 문자열의 SHA256이다.

각 변경은 재시도 중 같은 요청 UUID를 유지한다. 초안 수정에는 DB의 정밀한 `updated_at` 원문을 사용한다. 다른 요청이 수정했거나 확인한 명부가 바뀌면 고정 한국어 오류를 보여준다. 통신 오류 시 같은 화면의 재시도를 통해 이미 확정된 요청 결과를 재조회한다.

## 검증

`HRA_TEST_PG_BIN=/opt/homebrew/opt/postgresql@18/bin npx vitest run tests/unit/academic-assignment-admin-*.test.ts`로 권한·공개 게이트, 폼 접근성·한국시간·재시도, 공개 후 편집 차단 및 실제 PostgreSQL 대상 미리보기와 #149 공개 함수의 일치를 확인한다. 실제 제출 최종화 함수를 실행하여 목록·상세의 제출수도 검증한다.

브라우저는 `tests/e2e/academic-assignment-admin.spec.ts`를 사용한다. 비로그인 경계는 일반 CI에서 실행한다. 전체 흐름은 운영 환경 파일이 없는 격리 앱에 다음 fixture를 준비한 후 실행한다.

- `installAcademicIdentityFixture` 및 `installAcademicRosterMigrations`로 합성 계정과 명부 기반을 준비한다.
- `tests/support/academic-assignment-admin-fixture.mjs`의 `installAcademicAssignmentAdminFixture`로 수업·학생 두 명과 실제 #147→#148→#149 SQL을 설치한다.
- 격리 앱의 전체 공개·쓰기 설정을 켜고 실제 credentials 로그인으로 지정 FACULTY 승인자의 storageState를 발급한다.
- `PLAYWRIGHT_BASE_URL`, `HRA_ACADEMIC_QA_STATE`, `HRA_ACADEMIC_QA_COHORT_ID`를 지정한다. 선택 수업 검증에는 `HRA_ACADEMIC_QA_EVENT_ID`, `HRA_ACADEMIC_QA_SESSION_ID`도 지정한다.
- `npx playwright test tests/e2e/academic-assignment-admin.spec.ts`로 모바일·키보드 초안 등록→수정→대상 확인→공개→불변 상세→종료·재조회를 검증한다.

fixture는 임시 PostgreSQL에만 사용한다. 운영 계정·운영 Blob·운영 DB를 테스트에 사용하지 않는다.

## 자동 HTTP·브라우저 QA 실행기

운영 환경 파일이 없는 격리 worktree에서 `HRA_TEST_PG_BIN=/opt/homebrew/opt/postgresql@18/bin node scripts/verify-academic-assignment-admin-http.mjs`를 실행하면 위 준비와 검증을 자동 수행한다. 임시 PostgreSQL과 실제 Next 서버, 정상 CSRF·credentials 로그인만 사용한다. 미지정 ADMIN·MEMBER·FACULTY의 403, 승인 대기·비로그인 이동, 표가 없는 비활성 준비 안내부터 검증한다.

종료는 서버 확정 뒤 첫 응답을 브라우저에서 잃는 상황을 만든 뒤 확인 상태와 같은 요청 키를 유지해 재시도한다. 최종 DB가 종료 과제 1건·최초 대상 2건·최소 감사 4건(`CREATE`, `UPDATE_DRAFT`, `PUBLISH`, `CLOSE`)인지 확인하여 중복 변경을 배제한다. 사용자의 역할·기수·로그인 정보 보존도 대조한다. 쿠키는 임시 0600 파일에만 저장하고 실행 종료 시 임시 클러스터·파일·서버를 정리한다. trace·스크린샷·영상은 기록하지 않는다.
