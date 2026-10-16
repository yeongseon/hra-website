# 개인 제출 파일 다운로드

`GET /api/academic/submissions/[id]/file/[fileId]`는 최종 제출에 귀속된 PDF를 서버에서 전달한다. 요청은 제출 UUID와 파일 UUID만 받는다. 클라이언트의 저장 키·URL·기수·역할 값은 사용하지 않는다.

## 인가와 응답

인증을 먼저 확인하고 `ACADEMIC_ENABLED`가 정확히 `true`일 때만 신규 학사 표를 조회한다. 인증되지 않은 요청은 401, 미지정 ADMIN·FACULTY와 PENDING은 403, 기능 비활성 상태의 적격 사용자는 404다. 기능 비활성 검증은 학사 표가 없는 DB에서도 실행한다.

| 요청자 | 접근 조건 |
| --- | --- |
| 본인 MEMBER | 현재 계정 연결, 현재 MEMBER 역할, 종료되지 않은 ENROLLED 학적, 공개 시각이 지난 PUBLISHED/CLOSED 과제, 본인이 제출한 정확한 파일 |
| 지정 학사 승인자 | `ACADEMIC_APPROVER_USER_ID`와 현재 로그인 UUID가 일치하고 현재 역할이 ADMIN/FACULTY/MEMBER인 명시 관리 권한 |
| 그 외 | 거부. ADMIN 역할 또는 교수의 수업 담당 정보만으로 관리 권한을 주지 않음 |

같은 기수 학생·다른 기수 학생·없는 파일·다른 제출의 파일·잘못된 UUID는 동일한 404 본문을 받는다. 학적 종료나 계정 연결 해제 뒤에는 과거 본인 파일 접근도 거부한다. 지정 관리자는 보존된 최종 제출을 감사 후 조회할 수 있다. 현재 최종 제출 모델은 이력이 생긴 학생 연결의 변경 자체도 막으며, 연결 해제 검증 fixture는 이 방어 상황만 격리 DB에서 강제로 만든다.

성공 응답은 `application/octet-stream` 첨부 다운로드, UTF-8 인코딩 파일명, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`를 사용한다. 오류 응답에도 같은 캐시·nosniff 정책을 적용한다.

## 전용 private 저장소 계약

필수 서버 환경 변수는 다음과 같다.

- `ACADEMIC_ENABLED`
- `ACADEMIC_APPROVER_USER_ID`
- `ACADEMIC_SUBMISSION_BLOB_HOST`: 소문자 private Blob 호스트
- `ACADEMIC_SUBMISSION_READ_WRITE_TOKEN`: 해당 저장소 전용 토큰

저장 키는 `academic-uploads/v1/<불투명 UUID>/document.pdf` 형식만 허용한다. 공유 자료나 일반 업로드 토큰으로 대체하지 않는다. #151 업로드 완료 검증은 파일을 최종 제출에 귀속시키며, 다운로드는 DB에 확정된 키·PDF 형식·크기를 사용한다.

Blob SDK는 명시 토큰에서 저장소 ID를 추출하므로 `storeId` 옵션만으로 저장소 일치를 보장하지 못한다. 다운로드는 반환된 URL의 HTTPS·정확한 설정 호스트·포트/사용자 정보/쿼리/fragment 부재·정확한 DB 키 경로와 반환 `pathname`을 다시 검사한다. 크기·형식·저장소·경로가 다르면 원본 스트림을 취소하고 고정 503을 반환한다. DB/Blob 오류의 SQL·매개변수·키·URL·토큰·파일 본문은 응답이나 로그에 기록하지 않는다. 응답 시작 뒤 전송 실패는 원인을 포함하지 않는 고정 스트림 오류로 종료한다.

## 전달 허가 감사와 migration

`scripts/migrate-academic-submission-file-reads.sql`은 #144 학생/학적 → #147 과제 → #148 최종 제출 적용 뒤 실행한다. 운영 적용은 [DB 변경 절차](database-change-procedure.md)에 따라 승인된 대상에서 수행한다. 이 QA 실행기는 운영 migration을 실행하지 않는다.

`src/lib/db/academic-file-accesses.ts`의 `academicSubmissionFileReads`는 전체 schema 정본에서 재수출해야 한다. 실제 DB에는 별도 SQL의 불변 트리거와 카탈로그 검증도 필요하므로 `db:push`만으로 완료하지 않는다.

파일 메타 조회와 `academic_submission_file_reads` INSERT는 하나의 SQL 문장으로 수행한다. 계정·학생 연결·학적·과제·제출·파일 행의 SHARE 잠금으로 철회 변경과 결정을 직렬화한다. 감사 INSERT가 실패하면 파일을 읽지 않는다. 감사에는 행위자/제출/파일 UUID, OWNER 또는 MANAGEMENT 근거, 허가 시각만 남긴다. 이 기록은 **전달 허가**이며, 저장소 연결 실패나 사용자 연결 종료까지 포함한 실제 수신 완료를 증명하지 않는다.

감사는 UPDATE/DELETE를 거부하고 관련 사용자·제출·파일 참조의 삭제도 제한한다. 보존 기간 및 파기 절차가 확정되기 전 기존 이력이나 파일을 삭제하지 않는다. 향후 파기 정책은 검토된 별도 forward migration으로 구현한다.

## 격리 검증

Node 의존성 설치와 로컬 PostgreSQL 바이너리가 필요하다. `.env*`가 없는 별도 worktree에서 실행한다. 실행기는 운영 DB URL을 상속하지 않고 자체 PostgreSQL과 가짜 Neon `.invalid` 호스트만 사용하는 테스트 전송 어댑터로 실제 Next 서버를 띄운다. OAuth는 끄고 무작위 테스트 AUTH_SECRET과 합성 계정으로 정상 CSRF/credentials 로그인을 수행한다. 쿠키·헤더·개인정보·추적/스크린샷 파일은 저장하지 않으며 서버와 DB는 종료 시 정리한다.

```sh
HRA_TEST_PG_BIN=/opt/homebrew/opt/postgresql@18/bin \
  npx vitest run tests/unit/academic-submission-file.test.ts \
  tests/unit/academic-submission-file-store.test.ts \
  tests/unit/academic-submission-file-postgres.test.ts

HRA_TEST_PG_BIN=/opt/homebrew/opt/postgresql@18/bin \
  node scripts/verify-academic-submission-file-http.mjs --authorization-only
```

단위 검증은 실제 설치 SDK의 토큰 저장소 우선 동작까지 격리 HTTP 전송으로 재현한다. PostgreSQL 검증은 감사 원자성·현재 권한·학적 철회 경합·migration 재실행/드리프트/불변 이력을 확인한다. `--authorization-only`는 허용 경로가 감사 후 저장소 설정 부재 503이 되는 단계까지 43건을 확인하며, 실물 파일 200을 검증한 것으로 간주하지 않는다.

### 실제 private 파일 QA 입력

검증 담당자는 `tests/support/resource-qa-pdf.mjs`의 `resourceQaPdfBytes()` 바이트를 전용 private 저장소의 새 불투명 UUID 경로에 업로드한다. 파일 내용은 비민감 QA PDF이며 키는 앞의 고정 계약을 따른다. 운영 학생 파일이나 운영 사용자 계정을 재사용하지 않는다. 업로드는 실행기가 수행하지 않는다.

보호된 환경 전달 수단으로 다음 세 변수를 제공한 뒤 기본 모드를 실행한다. 토큰·키·URL을 명령 인수·문서·이슈·로그에 쓰지 않는다.

- `HRA_QA_SUBMISSION_STORAGE_KEY`: QA 파일 키
- `ACADEMIC_SUBMISSION_BLOB_HOST`
- `ACADEMIC_SUBMISSION_READ_WRITE_TOKEN`

```sh
HRA_TEST_PG_BIN=/opt/homebrew/opt/postgresql@18/bin \
  node scripts/verify-academic-submission-file-http.mjs
```

기본 모드는 44건으로, private 직접 URL의 토큰 없는 403, 본인 및 지정 FACULTY 관리자의 200, 원본 SHA-256 일치, 캐시/다운로드 헤더, 매 요청의 감사 개수, 쿠키 없는 재요청, 역할/세션 버전/학적/연결 변경 뒤 거부와 감사 실패 503을 검증한다. 개인정보가 없는 합성 fixture만 사용하고 실제 private 파일은 읽기만 한다. QA 업로드의 정리는 검증 담당자가 별도로 처리한다.
