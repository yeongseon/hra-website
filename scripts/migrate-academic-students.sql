-- #144: G1 학생 식별자와 기수별 등록만 추가한다. 백필·권한 변경·기존 행 수정은 하지 않는다.
-- 실행 전 preflight와 백업·복원 확인: docs/developer/academic-students-migration.md
-- 전체 작업은 한 트랜잭션이다. 구조가 다른 기존 테이블은 자동 보정하지 않고 롤백한다.
BEGIN;
SET LOCAL search_path = public, pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT pg_advisory_xact_lock(hashtextextended('hra:academic-students:v1', 0));

DO $migration$
BEGIN
  IF to_regtype('public.enrollment_status') IS NULL THEN
    CREATE TYPE public.enrollment_status AS ENUM ('ENROLLED');
  END IF;
  IF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
      FROM pg_enum e WHERE e.enumtypid = 'public.enrollment_status'::regtype)
      IS DISTINCT FROM ARRAY['ENROLLED']::text[] THEN
    RAISE EXCEPTION 'enrollment_status가 G1 정의와 다릅니다. 별도 forward-fix가 필요합니다.';
  END IF;
END;
$migration$;

CREATE TABLE IF NOT EXISTS public.academic_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid CONSTRAINT academic_students_user_id_unique UNIQUE
    CONSTRAINT academic_students_user_id_users_id_fk REFERENCES public.users(id) ON DELETE RESTRICT,
  display_name varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_students_display_name_not_blank CHECK (length(btrim(display_name)) > 0)
);

CREATE TABLE IF NOT EXISTS public.cohort_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL CONSTRAINT cohort_enrollments_student_id_academic_students_id_fk
    REFERENCES public.academic_students(id) ON DELETE RESTRICT,
  cohort_id uuid NOT NULL CONSTRAINT cohort_enrollments_cohort_id_cohorts_id_fk
    REFERENCES public.cohorts(id) ON DELETE RESTRICT,
  status public.enrollment_status NOT NULL DEFAULT 'ENROLLED',
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_by_user_id uuid CONSTRAINT cohort_enrollments_created_by_user_id_users_id_fk
    REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cohort_enrollments_student_cohort_unique UNIQUE (student_id, cohort_id),
  CONSTRAINT cohort_enrollments_ended_at_order CHECK (ended_at IS NULL OR ended_at >= enrolled_at)
);

CREATE INDEX IF NOT EXISTS cohort_enrollments_cohort_status_idx
  ON public.cohort_enrollments (cohort_id, status);

-- IF NOT EXISTS만으로 구조 일치를 보장할 수 없어 커밋 전에 컬럼·제약·인덱스를 대조한다.
DO $verification$
DECLARE
  expected record;
  actual_definition text;
BEGIN
  -- 같은 이름의 추가 CHECK·인덱스·트리거도 쓰기 의미를 바꿀 수 있어 허용하지 않는다.
  IF EXISTS (
    SELECT 1 FROM (VALUES ('academic_students', 4, 2), ('cohort_enrollments', 6, 3))
      AS shape(table_name, constraint_count, index_count)
    JOIN pg_class c ON c.oid = format('public.%I', shape.table_name)::regclass
    WHERE c.relkind <> 'r' OR c.relrowsecurity OR c.relforcerowsecurity
      -- PostgreSQL 18부터 NOT NULL도 카탈로그 제약으로 표시하며 컬럼 검증에서 별도 대조한다.
      OR (SELECT count(*) FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype <> 'n') <> shape.constraint_count
      OR (SELECT count(*) FROM pg_index i WHERE i.indrelid = c.oid) <> shape.index_count
      OR EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = c.oid AND NOT t.tgisinternal)
  ) THEN
    RAISE EXCEPTION '학적 테이블에 예상과 다른 제약·인덱스·트리거·RLS가 있습니다. 변경을 모두 롤백합니다.';
  END IF;
  IF EXISTS (
    WITH expected(table_name, column_name, data_type, required, default_value) AS (VALUES
      ('academic_students', 'id', 'uuid', true, 'gen_random_uuid()'),
      ('academic_students', 'user_id', 'uuid', false, NULL),
      ('academic_students', 'display_name', 'character varying(100)', true, NULL),
      ('academic_students', 'created_at', 'timestamp with time zone', true, 'now()'),
      ('academic_students', 'updated_at', 'timestamp with time zone', true, 'now()'),
      ('cohort_enrollments', 'id', 'uuid', true, 'gen_random_uuid()'),
      ('cohort_enrollments', 'student_id', 'uuid', true, NULL),
      ('cohort_enrollments', 'cohort_id', 'uuid', true, NULL),
      ('cohort_enrollments', 'status', 'enrollment_status', true, '''ENROLLED''::enrollment_status'),
      ('cohort_enrollments', 'enrolled_at', 'timestamp with time zone', true, 'now()'),
      ('cohort_enrollments', 'ended_at', 'timestamp with time zone', false, NULL),
      ('cohort_enrollments', 'created_by_user_id', 'uuid', false, NULL),
      ('cohort_enrollments', 'created_at', 'timestamp with time zone', true, 'now()'),
      ('cohort_enrollments', 'updated_at', 'timestamp with time zone', true, 'now()')
    ), actual AS (
      SELECT c.relname::text AS table_name, a.attname::text AS column_name,
             format_type(a.atttypid, a.atttypmod) AS data_type, a.attnotnull AS required,
             pg_get_expr(d.adbin, d.adrelid) AS default_value
      FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid
      LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
      WHERE c.oid IN ('public.academic_students'::regclass, 'public.cohort_enrollments'::regclass)
        AND a.attnum > 0 AND NOT a.attisdropped
    )
    SELECT 1 FROM expected e FULL JOIN actual a USING (table_name, column_name)
    WHERE e.table_name IS NULL OR a.table_name IS NULL
      OR e.data_type IS DISTINCT FROM a.data_type OR e.required IS DISTINCT FROM a.required
      OR e.default_value IS DISTINCT FROM a.default_value
  ) THEN
    RAISE EXCEPTION '학적 테이블 컬럼이 G1 정의와 다릅니다. 변경을 모두 롤백합니다.';
  END IF;

  FOR expected IN SELECT * FROM (VALUES
    ('academic_students', 'p', 'PRIMARY KEY (id)'),
    ('academic_students', 'u', 'UNIQUE (user_id)'),
    ('academic_students', 'f', 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT'),
    ('academic_students', 'c', 'CHECK ((length(btrim((display_name)::text)) > 0))'),
    ('cohort_enrollments', 'p', 'PRIMARY KEY (id)'),
    ('cohort_enrollments', 'u', 'UNIQUE (student_id, cohort_id)'),
    ('cohort_enrollments', 'f', 'FOREIGN KEY (student_id) REFERENCES academic_students(id) ON DELETE RESTRICT'),
    ('cohort_enrollments', 'f', 'FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE RESTRICT'),
    ('cohort_enrollments', 'f', 'FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT'),
    ('cohort_enrollments', 'c', 'CHECK (((ended_at IS NULL) OR (ended_at >= enrolled_at)))')
  ) AS definitions(table_name, constraint_type, definition)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = format('public.%I', expected.table_name)::regclass
        AND c.contype::text = expected.constraint_type AND c.convalidated
        AND NOT c.condeferrable AND pg_get_constraintdef(c.oid) = expected.definition
    ) THEN
      RAISE EXCEPTION '학적 테이블 제약이 G1 정의와 다릅니다: % / %', expected.table_name, expected.definition;
    END IF;
  END LOOP;

  SELECT pg_get_indexdef(i.indexrelid) INTO actual_definition FROM pg_index i
  WHERE i.indexrelid = 'public.cohort_enrollments_cohort_status_idx'::regclass
    AND i.indrelid = 'public.cohort_enrollments'::regclass AND i.indisvalid AND i.indisready;
  IF actual_definition IS DISTINCT FROM
    'CREATE INDEX cohort_enrollments_cohort_status_idx ON public.cohort_enrollments USING btree (cohort_id, status)' THEN
    RAISE EXCEPTION '학적 목록 인덱스가 G1 정의와 다릅니다. 변경을 모두 롤백합니다.';
  END IF;
END;
$verification$;
COMMIT;
