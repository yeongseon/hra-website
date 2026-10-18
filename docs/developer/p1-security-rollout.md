# P1 보안 수정 적용 절차 (#88, #89, #91)

> 문서 성격: 초기 수정 범위와 답변 보호 FK의 적용 기록. 아래의 이슈 번호와 당시 범위는 보존한다. 현재 전체 DB 적용 기준은 [DB 변경 절차](database-change-procedure.md), 자료 파일의 비공개 전환은 [파일 접근 정책](../resource-file-access-policy.md), 구현된 소유권 원장·정리는 [파일 정리 절차](../operations/markdown-image-ownership.md)를 따른다. 과거에 “후속 작업”으로 적은 내용이 지금도 미구현이라는 뜻은 아니다.

이 문서의 FK는 지원 답변과 질문을 연결하는 외래 키다. `DEFERRABLE INITIALLY DEFERRED`는 연결 규칙의 최종 검사를 트랜잭션 끝까지 미룬다는 의미이며, 질문 한 개의 삭제와 양식 전체의 삭제를 구분해 처리하기 위해 사용한다. 문서가 존재하거나 앱을 배포했다는 사실만으로 대상 DB에 이 규칙이 적용된 것은 아니다.

## 범위와 한계

- #89: 강의자료 목록·상세·메타데이터는 동일한 서버 SQL 권한 조건을 적용합니다.
  MEMBER는 학생용, FACULTY/ADMIN은 학생용·교수용만 조회합니다.
  공개 Blob URL 자체의 비공개화는 정책 이슈 #101의 별도 작업입니다.
- #88: 소유권이 확인되지 않은 본문 URL 자동 삭제를 중단합니다.
  게시글 삭제·편집 후 본문 파일이 남을 수 있으며, 이는 오삭제보다 보존을 우선하는 안전 조치입니다.
  파일 등록·공유 참조 모델과 안전한 GC는 후속 작업입니다. 서버 등록 첨부파일 정리는 유지합니다.
- #91: 질문 삭제 시 답변을 CASCADE로 지우지 않습니다.
  양식·기수 전체 삭제는 기존 연쇄 정리를 유지하도록 FK 검사를 커밋 시점까지 지연합니다.

## DB 적용 순서

1. 백업과 복구 절차를 확인하고 별도 테스트 DB에서 아래 SQL을 먼저 검증합니다.
2. 관리자가 대상 DB를 명시해 `scripts/migrate-protect-application-answers.sql`을 실행합니다.
   `psql -v ON_ERROR_STOP=1 -f scripts/migrate-protect-application-answers.sql`을 사용하되
   대상 연결 정보는 안전한 환경변수/비밀 관리 수단으로 전달합니다. 이 문서에 기록하지 않습니다.
3. 다음 조건을 확인한 뒤 앱을 배포합니다.

```sql
SELECT conname, confdeltype, condeferrable, condeferred, convalidated
FROM pg_constraint
WHERE conrelid = 'public.application_answers'::regclass
  AND conname = 'application_answers_question_id_application_questions_id_fk';
-- 기대값: confdeltype=a, condeferrable=true, condeferred=true, convalidated=true
```

SQL은 테이블 잠금 시간 제한이 있고 한 트랜잭션에서 FK를 교체합니다.
실패 시 전체 변경이 롤백되며, 기존 데이터를 삭제하거나 변환하지 않습니다.
운영 DB에는 자동 실행하지 않습니다. 이 SQL 적용 전에는 #91 보호가 활성화되지 않습니다.

## 스키마 도구 주의

현재 Drizzle 스키마 API는 FK의 `DEFERRABLE INITIALLY DEFERRED`를 표현하지 못합니다.
`schema.ts`의 `no action`만 적용해서는 양식·기수 전체 삭제가 실패할 수 있습니다.
새 DB 구성 또는 `drizzle-kit push`로 FK가 재생성된 뒤에는 위 SQL을 적용하고
카탈로그의 지연 검사 플래그를 다시 확인해야 합니다.
앱만 롤백하더라도 답변 보호 FK는 유지합니다. CASCADE로 되돌리면 데이터 유실 문제가 재발합니다.

## 격리된 검증

```sh
HRA_TEST_PG_BIN=/path/to/postgresql/bin npm test
npm run typecheck
npm run build
```

`tests/unit/p1-postgres.test.ts`는 임시 디렉터리에 새 클러스터를 만들고 유닉스 소켓으로만 연결합니다.
기존 DATABASE_URL이나 .env를 읽지 않으며 종료 시 서버와 파일을 정리합니다.
`HRA_TEST_PG_BIN`이 없으면 이 P1 테스트 묶음은 명시적으로 건너뜁니다. `/path/to/postgresql/bin`은 실제 설치 경로로 바꾸고, 실행 결과에서 건너뜀과 통과를 구분합니다. 다른 DB 테스트의 실행 조건은 해당 테스트·runbook을 확인합니다.
인가 SQL, 마이그레이션 재실행, 답변 보호, 질문·양식·기수·제출 삭제,
두 연결의 FK 잠금 경합을 검사합니다. 운영 계정·파일로 파괴적 테스트를 하지 않습니다.


## 적용 후 판단

**정상 결과:** 대상 FK의 카탈로그 값이 위 기대와 같고, 필요한 격리 회귀 테스트가 건너뛰어지지 않고 통과합니다. **실패하면:** SQL의 적용 대상·트랜잭션 결과·카탈로그를 먼저 확인하고 [DB 변경 절차](database-change-procedure.md)의 복구 판단을 따릅니다. 이 문서의 과거 범위를 새 환경 전체 설치 목록으로 사용하지 않습니다.
