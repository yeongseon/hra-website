# G1 학생·기수 등록 스키마 적용 (#144)

학사 DB를 처음 준비하거나 학생·기수 관계를 변경하는 개발자가 읽는다. **스키마**는 DB에 어떤 표와 관계를 둘지 정한 정의다. 여기서는 로그인 계정과 학생 명부를 분리하고, 학생이 기수에 등록한 관계를 `cohort_enrollments`에 보관한다. 실제 계정 연결은 [검증 연결 절차](academic-enrollment-backfill.md)에서 별도로 수행한다.

아래 SQL은 구현된 첫 저장 단계의 적용 절차다. DB에 적용됐는지는 실행 기록과 카탈로그(표·제약의 실제 구조 정보)로 확인해야 한다. [DB 변경 절차](database-change-procedure.md)를 먼저 읽고, 사전 확인 → 격리 DB 적용 → 구조·회귀 검증 순서로 진행한다. 학사 전체 설치 순서는 [G1 품질 게이트](academic-g1-quality-gate.md)에 있다.

`scripts/migrate-academic-students.sql`은 `academic_students`, `cohort_enrollments`,
`enrollment_status`만 추가한다. 기존 회원 역할·기수·지원서 행을 수정하거나 자동 백필하지 않는다.
이는 학생 명부의 저장 기반이며 학사 화면·인가·과제 제출 기능의 공개를 의미하지 않는다.

## 적용 전 확인

1. #140의 명부 등록·계정 연결 정책을 확인한다. #142의 개인정보 보존·파기 정책이 확정되기 전에는 운영 개인정보 적재·연결 해제·자동 파기 작업을 실행하지 않는다.
2. 운영 백업의 시점과 복구 가능한 Neon 분기/복원 지점을 기록하고 별도 분기에 복원해 확인한다. 연결 주소·개인정보·백업 내용을 공개 PR에 남기지 않는다.
3. `PGSERVICE` 또는 안전한 `PG*` 환경변수로 **격리 DB**를 먼저 지정한다. 연결 문자열을 명령줄이나 로그에 쓰지 않는다.
4. 다음 읽기 전용 점검을 실행한다. 기존 자료는 건수만 출력하며 행을 수정하지 않는다.

```bash
psql -X -v ON_ERROR_STOP=1 -f scripts/preflight-academic-students.sql
```

테이블이 모두 없으면 신규 적용 대상이다. 일부 테이블만 있거나 계정 연결·기수 등록의 중복/고아 참조가 있으면 실패한다.
기존 `users.cohort_id`와 신규 학적 기수가 다른 것은 여러 기수 등록일 수 있으므로 보고만 한다.
이메일·이름 일치로 연결하거나 보고된 차이를 자동 덮어쓰지 않는다.

## 생성·반복 적용과 검증

다음 두 번 적용은 **#144 단계 직후의 격리 DB**에서 반복 가능성을 확인하는 순서다. 후속 학사 migration을 설치한 DB에 옛 #144 baseline을 다시 적용하는 절차가 아니다. 후속 트리거 때문에 구조 검증이 거부할 수 있으므로, 학사 전체 검증은 [G1의 단계별 SQL 순서](academic-g1-quality-gate.md)를 따른다.

```bash
psql -X -v ON_ERROR_STOP=1 -f scripts/migrate-academic-students.sql
psql -X -v ON_ERROR_STOP=1 -f scripts/migrate-academic-students.sql
psql -X -v ON_ERROR_STOP=1 -f scripts/preflight-academic-students.sql
```

첫 명령과 재실행 모두 성공해야 한다. SQL은 단일 트랜잭션에서 잠금 대기 5초·문장 60초 제한과
동일 migration 간 advisory lock을 사용한다. 커밋 전에 컬럼 타입·NULL·기본값, enum, PK/UNIQUE/FK/CHECK,
기수·상태 인덱스를 대조한다. 다른 구조는 자동 보정하지 않고 전체를 롤백한다.

핵심 제약은 다음과 같다.

- 여러 `user_id=NULL` 학생을 허용하며 연결된 계정은 한 학생에게만 속한다.
- `UNIQUE(student_id, cohort_id)`가 동시 이중 등록을 차단한다. 학생의 다른 기수 등록은 허용한다.
- 학생·기수·연결 계정·등록 승인 계정은 `ON DELETE RESTRICT`로 보존한다. 기존 기수 삭제 경로도 학적이 생긴 뒤에는 DB에서 차단된다.
- G1 상태는 `ENROLLED`만 제공한다. 종료·수료 상태 전환은 #143/#163에서 결정한다.
- 시각은 `timestamptz`다. `updated_at`의 변경은 Drizzle의 기존 `$onUpdate` 패턴을 따른다. 직접 SQL 수정 시 명시적으로 갱신한다.

다음은 개인정보 없이 카탈로그만 확인한다.

```sql
SELECT c.relname, con.conname, con.contype, con.confdeltype, con.convalidated
FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
WHERE con.conrelid IN ('public.academic_students'::regclass, 'public.cohort_enrollments'::regclass)
ORDER BY c.relname, con.conname;

SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN ('academic_students', 'cohort_enrollments');
```

4개 FK의 `confdeltype`은 `r`이며 모든 제약이 검증돼 있어야 한다.
사용자별 학적은 `academic_students(user_id)` UNIQUE → `cohort_enrollments(student_id, cohort_id)`로 조회한다.
기수 명부는 `cohort_enrollments(cohort_id, status)` 인덱스를 사용한다.
작은 테이블에서는 순차 조회가 정상일 수 있어 실제 데이터 증가 후 `EXPLAIN (ANALYZE, BUFFERS)`로 다시 점검한다.

새 빈 DB에서 `db:push`를 사용했다면 이 범위 SQL도 실행해 Drizzle과 카탈로그가 일치하는지 검증한다.
기존·운영 DB에는 전체 `db:push`를 실행하지 않는다.

## 실패·복구와 운영 반영

- SQL 중간 실패는 해당 트랜잭션 전체 롤백이다. 데이터 수정·스키마 수동 보정 없이 원인을 먼저 확인한다.
- 이미 적용된 뒤 앱에 문제가 있으면 **앱만 이전 버전으로 되돌리고 학적 테이블은 보존**한다. 데이터가 있는 테이블을 DROP해 복구하지 않는다.
- 기존 구조 불일치는 해당 차이를 설명하는 별도 forward-fix SQL과 격리 DB 증거를 PR로 남긴다. 제약을 임시 해제하거나 실패를 무시하지 않는다.
- 백업 복원은 다른 기능의 이후 쓰기에도 영향을 주므로, 별도 분기에 복원하고 검증한 뒤 운영 전환을 결정한다.
- 격리 DB 적용·재실행·회귀 테스트와 CI를 통과한 커밋을 운영 반영한다. 운영 전후 preflight와 카탈로그 결과, 백업/복원 확인 시점만 비공개 운영 기록에 보관한다.

자동 검증 명령은 다음과 같다. 임시 로컬 클러스터를 만들고 종료 시 제거하며 운영 `DATABASE_URL`은 사용하지 않는다.

```bash
HRA_TEST_PG_BIN=/opt/homebrew/opt/postgresql@18/bin npm test -- tests/unit/academic-students-postgres.test.ts
```

운영 적용 여부와 개인정보 적재 승인은 별도 증거로 기록한다. 이 문서나 테스트 통과만으로 운영 DB에 적용됐다고 판단하지 않는다.

