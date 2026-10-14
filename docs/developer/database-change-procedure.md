# 데이터베이스 변경 절차

이 문서는 저장소의 DB 적용 기준입니다. 운영 DB와 새 개발 DB를 같은 명령으로 갱신하지 않습니다.
`schema.ts`에는 `DEFERRABLE INITIALLY DEFERRED` 외래키와 일부 저장 함수를 표현할 수 없으므로
`drizzle-kit push`만으로 배포를 끝낼 수 없습니다.
현재 버전별 마이그레이션 디렉터리는 없으며, 범위별 SQL·스크립트는 `scripts/migrate-*`에 있습니다.
새 스키마 변경은 해당 이슈·PR에 적용 순서와 검증 근거를 남깁니다.

## 새 개발·테스트 Neon DB

1. `cp .env.example .env` 후 별도 개발용 Neon DB 주소와 필요한 설정을 채웁니다. 운영 DB 주소를 사용하지 않습니다.
2. 빈 DB에 `npm run db:push`로 Drizzle 테이블·인덱스를 만듭니다.
3. `npm run db:migrate-atomic-application-questions`로 질문 저장·제출 검증 함수를 설치합니다.
4. `npm run db:migrate-add-markdown-image-assets`로 본문 이미지 참조 뷰를 설치합니다.
5. 대상 DB를 확인한 뒤 `psql -v ON_ERROR_STOP=1 -f scripts/migrate-protect-application-answers.sql`을 실행합니다.
   연결 정보는 안전한 환경변수나 PostgreSQL 서비스 파일로 전달하고 명령문·문서·로그에 쓰지 않습니다.
6. 아래 카탈로그 확인 SQL을 실행합니다. 기대값과 다르면 앱을 사용하기 전에 원인을 확인합니다.

```sql
SELECT conname, confdeltype, condeferrable, condeferred, convalidated
FROM pg_constraint
WHERE conrelid = 'public.application_answers'::regclass
  AND conname = 'application_answers_question_id_application_questions_id_fk';
-- 기대: confdeltype=a, condeferrable=true, condeferred=true, convalidated=true

SELECT to_regprocedure('save_application_form_questions(uuid,integer,jsonb)');
SELECT to_regprocedure('assert_application_form_questions_revision(uuid,integer)');
SELECT to_regclass('public.markdown_image_references');
-- 모두 NULL이 아니어야 합니다.
```

함수 인자는 스크립트가 바뀔 때 함께 갱신합니다. 질문 삭제 경합을 막는 FK의 상세 검증과
복구 절차는 [P1 보안 수정 적용 절차](p1-security-rollout.md)를 따릅니다.

## 기존 DB와 운영 DB

1. 백업과 복구 경로를 확인하고, 적용할 `schema.ts` 차이와 실제 DB 카탈로그를 검토합니다.
2. 변경 이슈에 포함된 **범위가 한정된** `db:migrate-*` 스크립트 또는 검토된 SQL을 테스트 DB에서 먼저 실행합니다.
3. 대상 DB에 같은 절차를 적용하고 해당 스크립트의 사후 검증과 위 카탈로그 확인을 통과시킵니다.
4. `npm run typecheck`, `npm test`, `npm run build`와 관련 기능 스모크를 확인한 뒤 앱을 배포합니다.

운영 DB에 `db:push`를 습관적으로 실행하지 않습니다. 이 명령은 전체 스키마 차이를 한꺼번에
적용하며, 기존 데이터에 영향을 주는 변경이 섞일 수 있습니다. 불가피하게 기존 DB에
`push`를 사용했다면 위의 추가 SQL·함수·뷰와 카탈로그 검증을 다시 수행합니다.
