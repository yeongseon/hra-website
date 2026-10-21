# G1 과제 정의·최초 공개 대상 스냅샷 적용 (#147)

과제 관련 DB 구조를 설치하거나 변경할 때 읽는다. **스키마**는 표·열·관계의 정의이고, **마이그레이션**은 그 정의와 저장 규칙을 DB에 적용하는 변경 파일이다. **대상 스냅샷**은 과제를 처음 공개한 순간에 확정한 학생 목록이다.

이 문서는 #147 저장 단계의 적용·검증 절차다. 학사 전체를 새 격리 DB에 구성할 때는 [G1 품질 게이트](academic-g1-quality-gate.md)의 전체 적용 순서를 따른다. 운영 적용 여부는 이 문서의 존재로 판단하지 않고 승인된 변경 기록에서 확인한다. 공통 준비는 [DB 변경 절차](database-change-procedure.md)를 먼저 읽는다.

`src/lib/db/academic-assignments.ts`는 `assignments`, `assignment_targets`와 상태 enum을 정의한다.
`scripts/migrate-academic-assignments.sql`이 같은 테이블·제약·인덱스와 공개 함수 및 불변 트리거를 설치한다.
기존 수업(`schedule_events`, `schedule_sessions`)과 학적을 참조하며 수업 테이블을 복제하지 않는다.
이 단계는 저장 계약이다. 운영 책임자 인가·변경 서비스(#149), 관리 화면(#155), 제출물(#148), 운영 개인정보 적재·파기 승인(#142)은 각각 연결된 별도 범위다.

## 적용 순서와 사전 확인

1. #140·#141 확정 정책과 [학생 명부 적용 절차](academic-students-migration.md)를 확인한다.
2. 안전한 `PGSERVICE` 또는 `PG*` 환경변수로 격리 복원 분기를 지정하고 운영 백업·복원 증거를 비공개 기록에 남긴다. 연결 URL·개인정보는 명령줄이나 공개 기록에 남기지 않는다.
3. #144 학생 명부 migration을 먼저 적용하고 그 버전의 재실행 검증을 완료한다. 그 뒤 #147을 적용한다.
4. 최초 도입 전에 아래 읽기 전용 카탈로그 점검을 수행한다. 두 과제 테이블이 없다면 신규 적용 대상이다. 이미 존재하면 이번 SQL의 구조 검증을 통과해야 하며, 미적용 DB의 임의 공개 기록을 자동으로 채택하지 않는다.

```sql
BEGIN READ ONLY;
SELECT to_regclass('public.cohort_enrollments') AS enrollments,
       to_regclass('public.schedule_events') AS events,
       to_regclass('public.schedule_sessions') AS sessions,
       to_regclass('public.assignments') AS assignments,
       to_regclass('public.assignment_targets') AS targets;
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('assignments', 'assignment_targets')
ORDER BY table_name, ordinal_position;
COMMIT;
```

```bash
psql -X -v ON_ERROR_STOP=1 -f scripts/migrate-academic-assignments.sql
psql -X -v ON_ERROR_STOP=1 -f scripts/migrate-academic-assignments.sql
```

SQL은 단일 트랜잭션·동일 migration advisory lock·5초 lock timeout·60초 statement timeout을 사용한다.
컬럼/기본값·enum·PK/FK/UNIQUE/CHECK·인덱스·기존 기수 연결이 다르면 전체 실패하며 자동 보정하지 않는다.
동일 버전 재실행은 같은 함수·트리거 본문을 재설치하며 테이블 데이터와 최초 공개 기록을 변경하지 않는다.

**후속 migration 적용 후 #144 단독 재실행 금지:** #144는 자신의 적용 시점에 사용자 트리거가 없는 구조를 검증한다.
#147은 `cohort_enrollments`에 과거 대상의 학생·기수 변경 방지 트리거를 추가하므로, 이후 #144 단독 재실행은 의도적으로 차단된다.
전체 신규 DB는 `#144 → #147`, 기존 적용 DB는 `#147 재실행`으로 검증한다. #144 검사 회피를 위해 트리거를 제거하지 않는다.
새 빈 DB에서 Drizzle `db:push`로 테이블만 만든 경우에도 이 SQL을 적용해야 한다. 기존 운영 DB의 전체 `db:push`는 사용하지 않는다.

## 공개 저장 계약

서버 액션은 검증된 세션 계정에 대한 G1 업무 인가를 먼저 수행하고 바인딩된 SQL 인자로 호출한다.
DB 계정이나 함수 실행 가능 여부는 학생·운영 책임자의 업무 인가 근거가 아니다.
공개 함수는 **READ COMMITTED 전용**이다. `REPEATABLE READ`/`SERIALIZABLE`에서는 오래된 명부 스냅샷을 사용할 수 있으므로 재호출을 포함해 명시적으로 거부한다. Neon HTTP 기본 격리 수준을 유지한다.
수업의 `cohort_id`, 세션의 `schedule_event_id`, 학적의 `student_id`/`cohort_id` 변경도 **참조 존재 여부와 무관하게 READ COMMITTED 전용**이다. 과거 스냅샷으로 나중에 생성된 공개 참조를 놓치는 이동을 차단한다. 해당 식별 필드를 바꾸지 않는 제목·내용 편집은 이 가드의 제한 대상이 아니다.

```sql
SELECT * FROM public.publish_academic_assignment($1::uuid, $2::uuid);
```

첫 인자는 과제 ID, 둘째는 인가를 통과한 실제 공개 계정 ID다. 함수는 `assignments` 한 행을 반환한다.
존재하지 않는 과제/공개 계정, 마감 누락·현재/과거·무한 시각은 예외로 거부한다.

- 과제는 항상 `DRAFT`로 생성한다. 제목은 공백 제외 필수·200자 이하, 안내는 50,000자 이하이다. 초안에는 마감이 없어도 된다.
- 공개 함수는 과제 행을 `FOR UPDATE`로 잠근다. 명부 테이블 `SHARE` 잠금으로 명부 쓰기 완료를 기다린 뒤 DB `clock_timestamp()`를 최초 공개 시각으로 저장한다. 미래 마감이 필수다.
- 같은 트랜잭션에서 `ENROLLED`, `ended_at IS NULL`, `enrolled_at <= published_at`, `created_at <= published_at`인 같은 기수 학적 전체를 대상으로 저장한다. 계정 미연결 학적도 명부 분모에 포함된다. 유효 명부가 0명이면 대상 0건인 공개가 가능하다.
- 대상 저장 실패는 상태·공개 주체·공개 시각까지 롤백한다. 서로 다른 요청의 동시 공개도 행 잠금으로 한 번만 스냅샷을 만든다.
- 공개 함수 재호출은 `PUBLISHED`/`CLOSED`의 기존 행을 그대로 반환한다. 최초 공개자·공개 시각·대상은 바뀌지 않는다. 마감·종료 후 재시도도 같다.
- 공개 대상 삽입은 공개 트리거 내부만 허용한다. 대상 수정·삭제·추가는 G1에서 모두 거부한다. 신규 등록/종료는 기존 분모를 바꾸지 않는다.
- `PUBLISHED → CLOSED`만 허용하며 재개·초안 복귀는 거부한다. 공개 후 제목·안내·마감·기수·수업·공개 이력은 제출 유무와 관계없이 불변이다. 새 내용은 별도 초안으로 만든다. 초안 편집·물리 삭제는 허용한다.
- 공개 이력이 있는 과제는 대상이 0명이어도 물리 삭제하지 않는다. 모든 FK는 `RESTRICT`다. 후속 제출 모델도 `assignment_targets`를 `RESTRICT`로 참조해야 한다.
- 과제의 수업·세션과 학생의 기수가 일치해야 한다. 연결된 기존 수업의 기수 이동, 세션의 수업 이동, 대상 학적의 학생·기수 이동도 DB가 거부한다. 학생이 다른 기수에 참여하면 기존 학적을 덮지 않고 새 등록을 만든다.
- 마감은 `timestamptz`다. 호출자는 `Asia/Seoul` 입력을 명시적으로 해석한 instant를 전달한다. `2099-10-16T09:00:00+09:00`은 `2099-10-16T00:00:00Z`로 저장된다. PostgreSQL 세션 표시 시간대는 저장 instant를 바꾸지 않는다.

이 migration은 등록 상태/계정 연결 정정의 인가·감사(#145), 공개 이벤트 감사(#149), 법적 보존 기간·파기(#142), 수료 정책(#143)을 새로 정하지 않는다.
애플리케이션 DB 역할에는 스키마 변경·트리거 비활성화·`TRUNCATE` 권한을 부여하지 않는다. DB 소유자의 DDL은 이 저장 계약을 우회할 수 있으므로 운영 복구 작업으로만 다룬다.

## 적용 후 검증

```sql
SELECT c.relname, k.conname, k.contype, k.confdeltype, k.convalidated
FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
WHERE k.conrelid IN ('public.assignments'::regclass, 'public.assignment_targets'::regclass)
ORDER BY c.relname, k.conname;
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN ('assignments', 'assignment_targets');
SELECT c.relname, t.tgname, t.tgenabled
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal AND t.tgname LIKE 'academic_assignment%'
ORDER BY c.relname, t.tgname;
```

이 #147 단계가 설치하는 FK 8개 모두 `confdeltype=r`, 제약 모두 검증 완료, 트리거 6개가 활성 상태여야 한다. 이후 제출·감사 migration을 적용한 DB의 전체 제약·트리거 수와 혼동하지 않는다.
기수별 과제는 `(cohort_id, status, due_at)`, 학생별 대상은 `(enrollment_id)`, 과제 전체 대상은 UNIQUE `(assignment_id, enrollment_id)` 인덱스를 사용한다.
운영 검증은 건수·카탈로그만 기록하고 학생 명단이나 과제 본문을 공개하지 않는다.

## 실패·복구

- 적용 중 실패하면 전체 트랜잭션이 롤백된다. 불일치 원인을 분석한 별도 forward-fix와 격리 검증을 준비한다. 실패를 무시하거나 제약을 제거해 재시도하지 않는다.
- 적용 후 앱 회귀는 앱 버전만 되돌리고 과제·대상 행은 보존한다. 함수 반환 타입은 테이블 복합 타입에 의존하므로 테이블 DROP 역시 복구 수단으로 사용하지 않는다.
- 잘못 공개한 과제는 `CLOSED`로 종료한다. 이 단계에는 대상/내용 재작성 경로가 없으며 보존·정정 승인 정책이 필요한 변경은 별도 이슈와 migration으로 처리한다.
- 복원이 필요하면 별도 Neon 분기에 복원해 제출·다른 기능의 이후 쓰기 보존을 확인한 뒤 운영 전환한다.

## 격리 검증

```bash
HRA_TEST_PG_BIN=/opt/homebrew/opt/postgresql@18/bin npm test -- tests/unit/academic-assignment-postgres.test.ts
npm run typecheck
npx eslint src/lib/db/academic-assignments.ts tests/unit/academic-assignment-postgres.test.ts
```

테스트는 운영 연결 정보를 읽지 않는 임시 PostgreSQL에서 신규 적용·재실행·구조 불일치 롤백,
Drizzle 카탈로그 일치, 명부 필터·KST 정각·다른 기수/수업 거부, 새 등록/종료 후 대상 보존,
공개 후 수정·삭제 차단, 대상 저장 실패 원자성, 동시 공개 멱등성, 지원하지 않는 격리 수준 거부를 검증하고 클러스터를 제거한다. 이전 REPEATABLE READ 스냅샷 확보 → 별도 연결의 공개 커밋 → 원래 연결의 수업 기수/세션 수업/학적 기수 이동 경합도 실제 연결 두 개로 검증한다.

기존 일정 수정은 세션 UUID를 보존해 차등 저장한다. 과제가 참조하는 세션을 유지한 제목·내용 편집은 허용하며, 실제 세션 제거·다른 일정 세션 주입은 안전한 오류로 거부한다.
`tests/unit/schedule-session-preservation-postgres.test.ts`가 실제 서버 액션의 단일 SQL CTE로 이 호환성과 실패 전체 롤백을 검증한다.

