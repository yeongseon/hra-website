# 데이터베이스 변경 절차

이 문서는 저장소의 **DB 구조를 실제 환경에 적용하는 기준**입니다. `schema.ts`를 수정하는 일, DB를 변경하는 일, 앱을 배포하는 일은 각각 다른 작업입니다. 먼저 [DB 입문 안내](../DATABASE.md)에서 테이블·외래 키·마이그레이션 용어를 확인할 수 있습니다.

현재 버전별 마이그레이션 디렉터리와 공통 적용 이력은 없으며, 범위별 SQL·스크립트는 `scripts/migrate-*`에 있습니다. 자동 적용 이력과 Production migration gate는 [#280](https://github.com/yeongseon/hra-website/issues/280)의 후속 작업입니다. 아래 수동 절차가 이미 자동 차단 장치로 구현됐다는 뜻은 아닙니다.

G1 학생·기수 등록 테이블은 [학생 명부 스키마 적용](academic-students-migration.md)의 범위 SQL과 읽기 전용 preflight를 사용합니다.
예약 ID 정리 인덱스는 [#287 변경 절차](rate-limit-reservation-index.md)의 범위 SQL·카탈로그 검증을 따릅니다. **이 SQL과 인덱스가 운영 DB에 적용됐다는 뜻은 아닙니다.** 운영 대상·백업·허용 잠금 시간·적용 승인은 별도로 확인합니다.

## 1. 대상과 명령의 효과부터 확인하기

| 상황·명령 | 용도 | 현재 주의할 동작 |
| --- | --- | --- |
| 새 빈 개발·테스트 Neon DB | 초기 테이블·인덱스 준비 | 제한된 범위에서 `db:push` 사용 후 추가 SQL·함수 검증 |
| 기존·운영 DB | 이미 저장된 데이터 보존하며 변경 | 검토된 범위별 SQL·스크립트 적용 |
| `npm run db:push` | Drizzle 정의와 DB의 전체 차이 반영 | 운영 URL 자동 차단 기능은 아직 없음 |
| `db:migrate-rate-limit-reservations` | 요청 제한 설치 대상 표시 | 인자 없이는 DB에 접속하지 않고 URL의 호스트·DB명만 표시 |
| 그 밖의 `db:migrate-*` | 스크립트별 구조 변경 | 이름만으로 dry-run이라 가정하지 않음; 실행 즉시 변경하는 스크립트가 있음 |

`dry-run`은 실제 변경 없이 확인하는 단계입니다. 모든 스크립트가 `--confirm-apply`를 지원하지 않습니다. 실행하려는 파일의 인자 처리와 적용 범위를 읽고, 이슈·PR에 대상 환경·순서·사후 검증을 남깁니다. 연결 문자열·비밀번호·운영 데이터는 공개 기록에 넣지 않습니다.

`schema.ts`만으로는 `DEFERRABLE INITIALLY DEFERRED` 외래 키와 일부 저장 함수·뷰를 모두 표현할 수 없습니다. `push`가 모든 함수를 무조건 삭제한다는 뜻은 아닙니다. **도구가 표현하지 않는 DB 객체까지 올바르게 설치·보존됐다고 보장할 수 없고, FK 재생성 시 별도 속성을 재확인해야 한다는 뜻**입니다.

## 2. 새 빈 개발·테스트 Neon DB

다음은 기본 웹 기능을 준비하는 절차입니다. 운영 DB의 갱신이나 학사 전체 설치 목록으로 사용하지 않습니다. 학사는 [G1 품질 게이트](academic-g1-quality-gate.md)의 단계별 SQL·검증을 따르며 준비 전에는 관련 기능을 열지 않습니다.

1. 새 작업 폴더에서 `.env.example`을 참고해 `.env`를 만들고 **별도 개발용 Neon DB**와 필요한 설정을 채웁니다. 기존 설정 파일을 덮어쓰지 않습니다.
2. 대상이 빈 DB임을 확인한 후 `npm run db:push`로 Drizzle 테이블·인덱스를 만듭니다.
3. 아래 기본 기능용 후속 항목을 적용합니다. `psql`을 쓰는 단계는 PostgreSQL 클라이언트 실행 파일도 준비합니다.
4. 카탈로그 확인 SQL과 관련 격리 테스트를 통과시킵니다. 카탈로그는 실제 테이블·제약·함수의 구조 정보를 뜻합니다.
5. 관리자 계정이 필요하면 [최초 관리자 준비](../DATABASE.md)를 수행하고 합성 데이터로 앱 기능을 확인합니다.

| 순서 | 적용 항목 | 명령·문서 |
| --- | --- | --- |
| 1 | 질문 저장·제출 버전 확인 함수 | `npm run db:migrate-atomic-application-questions` |
| 2 | 파일 소유권 원장·현재 참조 뷰 | `npm run db:migrate-add-markdown-image-assets` |
| 3 | 요청 제한 테이블·예약 함수 | [요청 제한 운영 절차](../operations/rate-limits.md)의 대상 표시 후 `--confirm-apply` |
| 4 | 모집설정 고정 키·기본 행 | `npm run db:migrate-recruitment-singleton` |
| 5 | 답변 보호와 지연 FK 검사 | `psql -X -v ON_ERROR_STOP=1 -f scripts/migrate-protect-application-answers.sql` |

`psql` 연결 정보는 안전한 `PG*` 환경변수나 PostgreSQL 서비스 파일로 전달합니다. 위 명령문 자체에는 접속 주소를 넣지 않습니다. 앱의 `DATABASE_URL`을 준비했다고 별도로 실행한 `psql`도 자동으로 같은 DB에 연결되는 것은 아니므로 둘의 대상을 확인합니다.

### 기본 카탈로그 확인

다음 SQL은 구조를 읽고 변경하지 않습니다.

```sql
SELECT conname, confdeltype, condeferrable, condeferred, convalidated
FROM pg_constraint
WHERE conrelid = 'public.application_answers'::regclass
  AND conname = 'application_answers_question_id_application_questions_id_fk';
-- 기대: confdeltype=a, condeferrable=true, condeferred=true, convalidated=true

SELECT to_regprocedure('save_application_form_questions(uuid,integer,jsonb)');
SELECT to_regprocedure('assert_application_form_questions_revision(uuid,integer)');
SELECT to_regprocedure('reserve_rate_limit(text[],text[],integer[],integer[])');
SELECT to_regclass('public.markdown_image_references');
SELECT to_regclass('public.rate_limit_events');
-- 모두 NULL이 아니어야 합니다.

SELECT conname FROM pg_constraint
WHERE conrelid = 'public.recruitment_settings'::regclass
  AND conname IN (
    'recruitment_settings_singleton_key_unique',
    'recruitment_settings_singleton_key_check'
  );
-- 두 제약이 있어야 합니다.
```

`NULL`은 해당 이름·인자의 객체를 찾지 못했다는 뜻입니다. 존재 확인만으로 함수 내용이 최신인지 검증되지는 않으므로 적용한 SQL과 기능 테스트도 확인합니다. 함수 인자가 바뀌면 이 확인 SQL도 함께 갱신합니다. 지연 FK의 이유와 상세 복구 기준은 [P1 답변 보호 적용 기록](p1-security-rollout.md)에 있습니다.

## 3. 기존 DB와 운영 DB

1. 연결할 환경과 변경 대상, 백업 시점, 복구 가능한 경로를 확인합니다. 적용 전 실제 카탈로그와 `schema.ts` 차이를 검토합니다.
2. 변경 이슈에 포함된 **범위가 한정된** 스크립트·SQL을 격리 DB에서 먼저 실행합니다. 기존 데이터 형태를 재현할 때에는 합성 데이터나 승인된 비식별 데이터를 사용합니다.
3. 잠금·기존 데이터 영향·앱과의 호환성을 확인하고 적용 순서와 실패 시 행동을 기록합니다. DB 변경을 Vercel build 명령에 끼워 넣지 않습니다.
4. 승인된 대상에 같은 절차를 적용하고 스크립트별 사후 검사와 관련 카탈로그 검증을 통과시킵니다.
5. 코드 검증과 관련 기능 스모크를 확인한 버전을 배포합니다. 스모크는 로그인·조회·저장처럼 핵심 기능이 작동하는지 간단히 확인하는 검사입니다.

```bash
npm run typecheck
npm test
npm run build
```

자동 테스트의 성공·실패·건너뜀을 구분합니다. 필요한 PostgreSQL 테스트가 건너뛰어졌다면 DB 변경 검증이 완료된 것으로 기록하지 않습니다.

## 4. 실패했을 때

| 상황 | 다음 행동 |
| --- | --- |
| 스크립트 오류 | 어느 단계까지 적용됐는지 사후 조회. 트랜잭션 범위는 해당 파일에서 확인 |
| 기대 함수·제약 없음 | 대상 DB와 적용 SQL을 확인한 뒤 누락 범위의 복구 계획 수립 |
| 기존 데이터·구조 불일치 | 결과를 보존하고 차이를 설명하는 별도 수정 SQL을 검토 |
| 실수로 기존 DB에 전체 push 실행 | 추가 변경을 멈추고 카탈로그·데이터 영향 확인. 전체 스크립트 일괄 재실행으로 복구하지 않음 |
| 앱만 롤백 | DB·파일 변경은 자동 복구되지 않으므로 이전 앱과의 호환성도 확인 |

각 실행은 환경·커밋·스크립트·시각·확인 결과를 기록합니다. 이 기록은 현재 공통 이력 테이블을 대신하는 운영 근거이며, 추후 자동 이력이 마련되면 절차를 갱신합니다.

## 코드 근거

`package.json`, `drizzle.config.ts`, `src/lib/db/schema.ts`, `scripts/migrate-atomic-application-questions.mjs`, `scripts/migrate-add-markdown-image-assets.mjs`, `scripts/migrate-rate-limit-reservations.mjs`, `scripts/sql/rate-limit-reservations.sql`, `scripts/migrate-recruitment-singleton.mjs`, `scripts/migrate-protect-application-answers.sql`.
