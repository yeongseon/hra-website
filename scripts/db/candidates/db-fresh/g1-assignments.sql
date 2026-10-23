-- #280 소유 로컬 fresh 후보: 운영 적용·실제 과거 적용 이력이 아닙니다.
-- 원본 참조: scripts/migrate-academic-assignments.sql
-- 검토 원본 SHA256: aa25c42c7dcce712530131753642a6ed7615ba251e5d4d8fa14f5796cc47f23f
-- reviewedDelta: 3행 BEGIN; → 제외; 6행 SET LOCAL statement_timeout = '60s'; → 제외; 316행 COMMIT; → 제외
-- 원본→후보 보존 행: 1-2→11-12; 4-5→13-14; 7-315→15-323
-- 사유: 파일 transaction은 S2가 소유하며 설치 statement timeout은 더 강한 engine 한도를 적용합니다.
-- 보존: 내부 BEGIN/END·search_path·advisory lock·함수 본문/proconfig·ACL·FK/trigger·임시 expected 객체.
-- namespaceDelta: 없음. app DDL은 기존 public 명시, TEMP/INDEX는 PostgreSQL의 원래 namespace 규칙을 보존합니다.
-- 상태: S2 기본 timeoutMs=10000의 statement=7500ms/lock=5000ms/idle=10000ms 전제이며 전체 prefix 대조는 별도입니다.

-- #147: 과제 정의·최초 공개 대상 스냅샷. 운영 적용 전 적용 문서와 백업을 확인한다.
-- 학적 스키마(#144)가 선행한다. 기존 행 백필·운영 권한 부여·파일 삭제는 하지 않는다.
SET LOCAL search_path = public, pg_catalog;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtextextended('hra:academic-assignments:v1', 0));
DO $enum$
BEGIN
  IF to_regtype('public.assignment_status') IS NULL THEN
    CREATE TYPE public.assignment_status AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');
  END IF;
  IF (SELECT array_agg(enumlabel::text ORDER BY enumsortorder) FROM pg_enum
      WHERE enumtypid = 'public.assignment_status'::regtype)
      IS DISTINCT FROM ARRAY['DRAFT','PUBLISHED','CLOSED']::text[] THEN
    RAISE EXCEPTION 'assignment_status 구조가 다릅니다. 별도 forward-fix가 필요합니다.';
  END IF;
END;
$enum$;
CREATE TABLE IF NOT EXISTS public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid NOT NULL CONSTRAINT assignments_cohort_id_cohorts_id_fk REFERENCES public.cohorts(id) ON DELETE RESTRICT,
  schedule_event_id uuid CONSTRAINT assignments_schedule_event_id_schedule_events_id_fk REFERENCES public.schedule_events(id) ON DELETE RESTRICT,
  schedule_session_id uuid CONSTRAINT assignments_schedule_session_id_schedule_sessions_id_fk REFERENCES public.schedule_sessions(id) ON DELETE RESTRICT,
  title varchar(200) NOT NULL,
  instructions text NOT NULL DEFAULT '',
  due_at timestamptz,
  status public.assignment_status NOT NULL DEFAULT 'DRAFT',
  created_by_user_id uuid NOT NULL CONSTRAINT assignments_created_by_user_id_users_id_fk REFERENCES public.users(id) ON DELETE RESTRICT,
  published_by_user_id uuid CONSTRAINT assignments_published_by_user_id_users_id_fk REFERENCES public.users(id) ON DELETE RESTRICT,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignments_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT assignments_instructions_length CHECK (length(instructions) <= 50000),
  CONSTRAINT assignments_session_requires_event CHECK (schedule_session_id IS NULL OR schedule_event_id IS NOT NULL),
  CONSTRAINT assignments_publication_shape CHECK (
    (status = 'DRAFT' AND published_at IS NULL AND published_by_user_id IS NULL) OR
    (status <> 'DRAFT' AND published_at IS NOT NULL AND published_by_user_id IS NOT NULL AND due_at IS NOT NULL AND due_at > published_at))
);
CREATE INDEX IF NOT EXISTS assignments_cohort_status_due_idx ON public.assignments (cohort_id,status,due_at);
CREATE TABLE IF NOT EXISTS public.assignment_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL CONSTRAINT assignment_targets_assignment_id_assignments_id_fk REFERENCES public.assignments(id) ON DELETE RESTRICT,
  enrollment_id uuid NOT NULL CONSTRAINT assignment_targets_enrollment_id_cohort_enrollments_id_fk REFERENCES public.cohort_enrollments(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL,
  assigned_by_user_id uuid NOT NULL CONSTRAINT assignment_targets_assigned_by_user_id_users_id_fk REFERENCES public.users(id) ON DELETE RESTRICT,
  CONSTRAINT assignment_targets_assignment_enrollment_unique UNIQUE (assignment_id,enrollment_id)
);
CREATE INDEX IF NOT EXISTS assignment_targets_enrollment_idx ON public.assignment_targets (enrollment_id);

-- IF NOT EXISTS는 스키마 검증이 아니다. 다른 구조를 자동으로 덮지 않고 전체 롤백한다.
DO $shape$
DECLARE expected record;
BEGIN
  IF EXISTS (
    WITH expected(table_name,column_name,data_type,required,default_value) AS (VALUES
      ('assignments','id','uuid',true,'gen_random_uuid()'),
      ('assignments','cohort_id','uuid',true,NULL),
      ('assignments','schedule_event_id','uuid',false,NULL),
      ('assignments','schedule_session_id','uuid',false,NULL),
      ('assignments','title','character varying(200)',true,NULL),
      ('assignments','instructions','text',true,'''''::text'),
      ('assignments','due_at','timestamp with time zone',false,NULL),
      ('assignments','status','assignment_status',true,'''DRAFT''::assignment_status'),
      ('assignments','created_by_user_id','uuid',true,NULL),
      ('assignments','published_by_user_id','uuid',false,NULL),
      ('assignments','published_at','timestamp with time zone',false,NULL),
      ('assignments','created_at','timestamp with time zone',true,'now()'),
      ('assignments','updated_at','timestamp with time zone',true,'now()'),
      ('assignment_targets','id','uuid',true,'gen_random_uuid()'),
      ('assignment_targets','assignment_id','uuid',true,NULL),
      ('assignment_targets','enrollment_id','uuid',true,NULL),
      ('assignment_targets','assigned_at','timestamp with time zone',true,NULL),
      ('assignment_targets','assigned_by_user_id','uuid',true,NULL)
    ), actual AS (
      SELECT c.relname::text table_name,a.attname::text column_name,format_type(a.atttypid,a.atttypmod) data_type,
        a.attnotnull required,pg_get_expr(d.adbin,d.adrelid) default_value
      FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid
      LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE c.oid IN ('public.assignments'::regclass,'public.assignment_targets'::regclass)
        AND a.attnum>0 AND NOT a.attisdropped
    ) SELECT 1 FROM expected e FULL JOIN actual a USING (table_name,column_name)
      WHERE e.table_name IS NULL OR a.table_name IS NULL OR e.data_type IS DISTINCT FROM a.data_type
        OR e.required IS DISTINCT FROM a.required
        OR e.default_value IS DISTINCT FROM a.default_value
  ) THEN RAISE EXCEPTION '과제 테이블 컬럼 정의 불일치'; END IF;
  -- PostgreSQL의 NOT NULL 카탈로그 항목은 컬럼 검증으로 처리한다.
  IF EXISTS (
    SELECT 1 FROM (VALUES ('assignments',10,2),('assignment_targets',5,3)) s(name,constraints,indexes)
    JOIN pg_class c ON c.oid=format('public.%I',s.name)::regclass
    WHERE c.relkind<>'r' OR c.relrowsecurity OR c.relforcerowsecurity
      OR (SELECT count(*) FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype<>'n')<>s.constraints
      OR (SELECT count(*) FROM pg_index i WHERE i.indrelid=c.oid)<>s.indexes
  ) THEN RAISE EXCEPTION '과제 테이블 제약·인덱스·RLS 구조 불일치'; END IF;
  FOR expected IN SELECT * FROM (VALUES
    ('assignments','PRIMARY KEY (id)'),
    ('assignments','FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE RESTRICT'),
    ('assignments','FOREIGN KEY (schedule_event_id) REFERENCES schedule_events(id) ON DELETE RESTRICT'),
    ('assignments','FOREIGN KEY (schedule_session_id) REFERENCES schedule_sessions(id) ON DELETE RESTRICT'),
    ('assignments','FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT'),
    ('assignments','FOREIGN KEY (published_by_user_id) REFERENCES users(id) ON DELETE RESTRICT'),
    ('assignments','CHECK ((length(btrim((title)::text)) > 0))'),
    ('assignments','CHECK ((length(instructions) <= 50000))'),
    ('assignments','CHECK (((schedule_session_id IS NULL) OR (schedule_event_id IS NOT NULL)))'),
    ('assignment_targets','PRIMARY KEY (id)'),
    ('assignment_targets','FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE RESTRICT'),
    ('assignment_targets','FOREIGN KEY (enrollment_id) REFERENCES cohort_enrollments(id) ON DELETE RESTRICT'),
    ('assignment_targets','FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE RESTRICT'),
    ('assignment_targets','UNIQUE (assignment_id, enrollment_id)')
  ) d(table_name,definition) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid=format('public.%I',expected.table_name)::regclass
      AND c.convalidated AND NOT c.condeferrable AND pg_get_constraintdef(c.oid)=expected.definition) THEN
      RAISE EXCEPTION '과제 제약 불일치: %',expected.definition;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.assignments'::regclass
    AND conname='assignments_publication_shape' AND contype='c' AND convalidated
    AND pg_get_expr(conbin,conrelid) = '(((status = ''DRAFT''::assignment_status) AND (published_at IS NULL) AND (published_by_user_id IS NULL)) OR ((status <> ''DRAFT''::assignment_status) AND (published_at IS NOT NULL) AND (published_by_user_id IS NOT NULL) AND (due_at IS NOT NULL) AND (due_at > published_at)))') THEN
    RAISE EXCEPTION '과제 공개 상태 CHECK 불일치';
  END IF;
  FOR expected IN SELECT * FROM (VALUES
    ('assignments_cohort_status_due_idx','CREATE INDEX assignments_cohort_status_due_idx ON public.assignments USING btree (cohort_id, status, due_at)'),
    ('assignment_targets_enrollment_idx','CREATE INDEX assignment_targets_enrollment_idx ON public.assignment_targets USING btree (enrollment_id)')
  ) d(name,definition) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=format('public.%I',expected.name)::regclass
      AND indisvalid AND indisready AND pg_get_indexdef(indexrelid)=expected.definition) THEN
      RAISE EXCEPTION '과제 인덱스 불일치: %',expected.name;
    END IF;
  END LOOP;
  -- 기존 데이터도 현재 무결성을 만족해야 한다. 미적용 상태의 임의 공개 기록은 수용하지 않는다.
  IF EXISTS (SELECT 1 FROM public.assignments WHERE status<>'DRAFT')
    AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.assignments'::regclass
      AND tgname='academic_assignment_snapshot' AND NOT tgisinternal) THEN
    RAISE EXCEPTION '공개 트리거 없이 생성된 공개 기록은 별도 검증이 필요합니다.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.assignments a LEFT JOIN public.schedule_events e ON e.id=a.schedule_event_id
    LEFT JOIN public.schedule_sessions s ON s.id=a.schedule_session_id
    WHERE (a.schedule_event_id IS NOT NULL AND e.cohort_id IS DISTINCT FROM a.cohort_id)
      OR (a.schedule_session_id IS NOT NULL AND s.schedule_event_id IS DISTINCT FROM a.schedule_event_id))
    OR EXISTS (SELECT 1 FROM public.assignment_targets t JOIN public.assignments a ON a.id=t.assignment_id
      JOIN public.cohort_enrollments e ON e.id=t.enrollment_id
      WHERE a.status='DRAFT' OR e.cohort_id IS DISTINCT FROM a.cohort_id
        OR t.assigned_at IS DISTINCT FROM a.published_at OR t.assigned_by_user_id IS DISTINCT FROM a.published_by_user_id) THEN
    RAISE EXCEPTION '기존 과제·대상 기록의 기수 또는 공개 정보 불일치';
  END IF;
END;
$shape$;

-- 쓰기 계약은 DB에도 둔다. 호출 계정의 업무 인가는 서버 액션(#149)이 먼저 확인한다.
CREATE OR REPLACE FUNCTION public.guard_academic_assignment() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog,public AS $guard$
DECLARE linked_cohort uuid; linked_event uuid;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.status<>'DRAFT' THEN RAISE EXCEPTION '공개 이력이 있는 과제는 삭제할 수 없습니다.'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'DRAFT' OR NEW.published_at IS NOT NULL OR NEW.published_by_user_id IS NOT NULL THEN
      RAISE EXCEPTION '과제는 초안으로 생성해야 합니다.';
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
      RAISE EXCEPTION '과제 식별자와 작성 이력은 변경할 수 없습니다.';
    END IF;
    IF OLD.status<>'DRAFT' THEN
      IF (to_jsonb(NEW)-'status'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'updated_at')
        OR NOT (NEW.status=OLD.status OR (OLD.status='PUBLISHED' AND NEW.status='CLOSED')) THEN
        RAISE EXCEPTION '공개 후 과제 내용·대상·마감은 불변이며 종료만 허용합니다.';
      END IF;
      NEW.updated_at=clock_timestamp();
      RETURN NEW;
    END IF;
    IF NEW.status='CLOSED' THEN RAISE EXCEPTION '초안은 바로 종료할 수 없습니다.'; END IF;
    IF NEW.status='PUBLISHED' THEN
      IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION '과제 공개는 READ COMMITTED 트랜잭션에서만 지원합니다.';
      END IF;
      -- 명부 쓰기와 공개가 겹치면 직렬화한다. 잠금 획득 뒤 DB 시각을 확정한다.
      LOCK TABLE public.cohort_enrollments IN SHARE MODE;
      NEW.published_at=clock_timestamp();
      IF NEW.due_at IS NULL OR NOT isfinite(NEW.due_at) OR NEW.due_at<=NEW.published_at
        OR NEW.published_by_user_id IS NULL THEN
        RAISE EXCEPTION '공개에는 미래 마감 시각과 공개 계정이 필요합니다.';
      END IF;
    ELSIF NEW.published_at IS NOT NULL OR NEW.published_by_user_id IS NOT NULL THEN
      RAISE EXCEPTION '초안에는 공개 이력을 저장할 수 없습니다.';
    END IF;
  END IF;
  IF NEW.due_at IS NOT NULL AND NOT isfinite(NEW.due_at) THEN
    RAISE EXCEPTION '유효한 마감 시각을 입력해야 합니다.';
  END IF;
  IF NEW.schedule_event_id IS NOT NULL THEN
    SELECT cohort_id INTO linked_cohort FROM public.schedule_events WHERE id=NEW.schedule_event_id FOR SHARE;
    IF NOT FOUND OR linked_cohort IS DISTINCT FROM NEW.cohort_id THEN
      RAISE EXCEPTION '과제와 수업의 기수가 일치해야 합니다.';
    END IF;
  END IF;
  IF NEW.schedule_session_id IS NOT NULL THEN
    SELECT schedule_event_id INTO linked_event FROM public.schedule_sessions WHERE id=NEW.schedule_session_id FOR SHARE;
    IF NOT FOUND OR linked_event IS DISTINCT FROM NEW.schedule_event_id THEN
      RAISE EXCEPTION '세션은 연결된 수업에 속해야 합니다.';
    END IF;
  END IF;
  NEW.updated_at=clock_timestamp();
  RETURN NEW;
END;
$guard$;
CREATE OR REPLACE FUNCTION public.snapshot_academic_assignment() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog,public AS $snapshot$
BEGIN
  IF OLD.status='DRAFT' AND NEW.status='PUBLISHED' THEN
    INSERT INTO public.assignment_targets (assignment_id,enrollment_id,assigned_at,assigned_by_user_id)
      SELECT NEW.id,e.id,NEW.published_at,NEW.published_by_user_id
      FROM public.cohort_enrollments e
      WHERE e.cohort_id=NEW.cohort_id AND e.status='ENROLLED' AND e.ended_at IS NULL
        AND e.enrolled_at<=NEW.published_at AND e.created_at<=NEW.published_at;
  END IF;
  RETURN NEW;
END;
$snapshot$;
CREATE OR REPLACE FUNCTION public.guard_academic_assignment_target() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog,public AS $target$
DECLARE definition public.assignments; enrollment public.cohort_enrollments;
BEGIN
  IF TG_OP<>'INSERT' OR pg_trigger_depth()<>2 THEN
    RAISE EXCEPTION '공개 스냅샷 대상은 공개 트리거만 생성하며 변경·삭제할 수 없습니다.';
  END IF;
  SELECT * INTO definition FROM public.assignments WHERE id=NEW.assignment_id;
  SELECT * INTO enrollment FROM public.cohort_enrollments WHERE id=NEW.enrollment_id;
  IF definition.status<>'PUBLISHED' OR enrollment.cohort_id IS DISTINCT FROM definition.cohort_id
    OR NEW.assigned_at IS DISTINCT FROM definition.published_at
    OR NEW.assigned_by_user_id IS DISTINCT FROM definition.published_by_user_id THEN
    RAISE EXCEPTION '과제 대상과 기수·공개 기록이 일치해야 합니다.';
  END IF;
  RETURN NEW;
END;
$target$;
-- 참조되는 수업·세션·학적이 나중에 다른 기수/학생으로 바뀌는 경로도 닫는다.
CREATE OR REPLACE FUNCTION public.guard_academic_assignment_reference() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog,public AS $reference$
BEGIN
  -- 과거 스냅샷은 나중에 생성된 참조를 보지 못한다. 연결 대상 필드 이동은
  -- 참조 유무를 조회하기 전에 READ COMMITTED만 허용하여 이 우회를 막는다.
  IF TG_TABLE_NAME='schedule_events' THEN
    IF NEW.cohort_id IS DISTINCT FROM OLD.cohort_id
      AND current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION '수업 기수 변경은 READ COMMITTED 트랜잭션에서만 지원합니다.';
    END IF;
    IF NEW.cohort_id IS DISTINCT FROM OLD.cohort_id
      AND EXISTS (SELECT 1 FROM public.assignments WHERE schedule_event_id=OLD.id) THEN
      RAISE EXCEPTION '과제가 참조하는 수업의 기수는 변경할 수 없습니다.';
    END IF;
  ELSIF TG_TABLE_NAME='schedule_sessions' THEN
    IF NEW.schedule_event_id IS DISTINCT FROM OLD.schedule_event_id
      AND current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION '세션 수업 변경은 READ COMMITTED 트랜잭션에서만 지원합니다.';
    END IF;
    IF NEW.schedule_event_id IS DISTINCT FROM OLD.schedule_event_id
      AND EXISTS (SELECT 1 FROM public.assignments WHERE schedule_session_id=OLD.id) THEN
      RAISE EXCEPTION '과제가 참조하는 세션의 수업은 변경할 수 없습니다.';
    END IF;
  ELSIF TG_TABLE_NAME='cohort_enrollments' THEN
    IF (NEW.student_id IS DISTINCT FROM OLD.student_id OR NEW.cohort_id IS DISTINCT FROM OLD.cohort_id)
      AND current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION '학적 학생·기수 변경은 READ COMMITTED 트랜잭션에서만 지원합니다.';
    END IF;
    IF (NEW.student_id IS DISTINCT FROM OLD.student_id OR NEW.cohort_id IS DISTINCT FROM OLD.cohort_id)
      AND EXISTS (SELECT 1 FROM public.assignment_targets WHERE enrollment_id=OLD.id) THEN
      RAISE EXCEPTION '과제 대상 학적의 학생·기수는 변경할 수 없습니다.';
    END IF;
  END IF;
  RETURN NEW;
END;
$reference$;
CREATE OR REPLACE FUNCTION public.publish_academic_assignment(p_assignment_id uuid,p_actor_user_id uuid)
RETURNS public.assignments LANGUAGE plpgsql SET search_path = pg_catalog,public AS $publish$
DECLARE definition public.assignments;
BEGIN
  -- 오래된 트랜잭션 스냅샷은 공개 시점 명부를 누락시킬 수 있어 명시적으로 거부한다.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION '과제 공개는 READ COMMITTED 트랜잭션에서만 지원합니다.';
  END IF;
  IF p_actor_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_actor_user_id) THEN
    RAISE EXCEPTION '인증된 공개 계정이 필요합니다.';
  END IF;
  SELECT * INTO definition FROM public.assignments WHERE id=p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '과제를 찾을 수 없습니다.'; END IF;
  -- 동일 과제 재호출은 종료·마감 이후에도 최초 스냅샷과 공개 주체를 그대로 반환한다.
  IF definition.status<>'DRAFT' THEN RETURN definition; END IF;
  UPDATE public.assignments SET status='PUBLISHED',published_by_user_id=p_actor_user_id
    WHERE id=p_assignment_id RETURNING * INTO definition;
  RETURN definition;
END;
$publish$;
DROP TRIGGER IF EXISTS academic_assignment_guard ON public.assignments;
CREATE TRIGGER academic_assignment_guard BEFORE INSERT OR UPDATE OR DELETE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.guard_academic_assignment();
DROP TRIGGER IF EXISTS academic_assignment_snapshot ON public.assignments;
CREATE TRIGGER academic_assignment_snapshot AFTER UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_academic_assignment();
DROP TRIGGER IF EXISTS academic_assignment_target_guard ON public.assignment_targets;
CREATE TRIGGER academic_assignment_target_guard BEFORE INSERT OR UPDATE OR DELETE ON public.assignment_targets
  FOR EACH ROW EXECUTE FUNCTION public.guard_academic_assignment_target();
DROP TRIGGER IF EXISTS academic_assignment_event_reference ON public.schedule_events;
CREATE TRIGGER academic_assignment_event_reference BEFORE UPDATE ON public.schedule_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_academic_assignment_reference();
DROP TRIGGER IF EXISTS academic_assignment_session_reference ON public.schedule_sessions;
CREATE TRIGGER academic_assignment_session_reference BEFORE UPDATE ON public.schedule_sessions
  FOR EACH ROW EXECUTE FUNCTION public.guard_academic_assignment_reference();
DROP TRIGGER IF EXISTS academic_assignment_enrollment_reference ON public.cohort_enrollments;
CREATE TRIGGER academic_assignment_enrollment_reference BEFORE UPDATE ON public.cohort_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.guard_academic_assignment_reference();
