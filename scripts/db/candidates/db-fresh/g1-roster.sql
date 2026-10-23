-- #280 소유 로컬 fresh 후보: 운영 적용·실제 과거 적용 이력이 아닙니다.
-- 원본 참조: scripts/migrate-academic-roster.sql
-- 검토 원본 SHA256: fef40d568310b9b2949dd410324e1237ac26a0268e189eaf6b3380b8e18242f1
-- reviewedDelta: 3행 BEGIN; → 제외; 125행 COMMIT; → 제외
-- 원본→후보 보존 행: 1-2→11-12; 4-124→13-133
-- 사유: 파일 transaction은 S2가 소유하며 설치 statement timeout은 더 강한 engine 한도를 적용합니다.
-- 보존: 내부 BEGIN/END·search_path·advisory lock·함수 본문/proconfig·ACL·FK/trigger·임시 expected 객체.
-- namespaceDelta: 없음. app DDL은 기존 public 명시, TEMP/INDEX는 PostgreSQL의 원래 namespace 규칙을 보존합니다.
-- 상태: S2 기본 timeoutMs=10000의 statement=7500ms/lock=5000ms/idle=10000ms 전제이며 전체 prefix 대조는 별도입니다.

-- #146 학생·기수 등록과 최소 승인 감사의 원자성 및 요청 재시도 멱등성을 제공한다.
-- #144를 적용한 격리 DB에서 검증한 뒤 승인된 변경 절차로 적용한다. 학생/계정 자동 연결은 하지 않는다.
SET LOCAL search_path = pg_catalog, public;

CREATE TABLE IF NOT EXISTS public.academic_roster_registrations (
  request_id uuid PRIMARY KEY,
  actor_user_id uuid NOT NULL CONSTRAINT academic_roster_registrations_actor_fk REFERENCES public.users(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL CONSTRAINT academic_roster_registrations_student_fk REFERENCES public.academic_students(id) ON DELETE RESTRICT,
  cohort_id uuid NOT NULL CONSTRAINT academic_roster_registrations_cohort_fk REFERENCES public.cohorts(id) ON DELETE RESTRICT,
  enrollment_id uuid NOT NULL CONSTRAINT academic_roster_registrations_enrollment_id_unique UNIQUE CONSTRAINT academic_roster_registrations_enrollment_fk REFERENCES public.cohort_enrollments(id) ON DELETE RESTRICT,
  verification_method text NOT NULL CONSTRAINT academic_roster_registrations_verification_method_check CHECK (verification_method IN ('IN_PERSON', 'VERIFIED_CONTACT')),
  evidence_reference uuid NOT NULL,
  request_fingerprint varchar(64) NOT NULL CONSTRAINT academic_roster_registrations_request_fingerprint_check CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- 기존 표의 타입이나 키가 다르면 자동으로 덮어쓰지 않고 전체를 롤백한다.
DO $verify$
DECLARE v_actual jsonb;
BEGIN
  -- 일반 표·기본 인덱스 2개만 허용하고 RLS나 사용자 트리거로 쓰기 의미가 달라지면 중단한다.
  IF EXISTS (SELECT 1 FROM pg_class c WHERE c.oid='public.academic_roster_registrations'::regclass
    AND (c.relkind <> 'r' OR c.relrowsecurity OR c.relforcerowsecurity
      OR (SELECT count(*) FROM pg_index i WHERE i.indrelid=c.oid) <> 2
      OR EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid
        AND (NOT i.indisvalid OR NOT i.indisready OR NOT i.indislive))
      OR EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)))
  THEN RAISE EXCEPTION 'roster_migration_structure_mismatch'; END IF;
  SELECT jsonb_agg(jsonb_build_array(a.attname, format_type(a.atttypid,a.atttypmod),a.attnotnull,
      pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
    INTO v_actual FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public.academic_roster_registrations'::regclass AND a.attnum>0 AND NOT a.attisdropped;
  IF v_actual <> '[
    ["request_id","uuid",true,null],["actor_user_id","uuid",true,null],["student_id","uuid",true,null],
    ["cohort_id","uuid",true,null],["enrollment_id","uuid",true,null],["verification_method","text",true,null],
    ["evidence_reference","uuid",true,null],["request_fingerprint","character varying(64)",true,null],
    ["created_at","timestamp with time zone",true,"now()"]]'::jsonb THEN
    RAISE EXCEPTION 'roster_migration_schema_mismatch';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid='public.academic_roster_registrations'::regclass AND contype <> 'n') <> 8
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.academic_roster_registrations'::regclass
      AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (request_id)')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.academic_roster_registrations'::regclass
      AND conname='academic_roster_registrations_enrollment_id_unique' AND contype='u'
      AND pg_get_constraintdef(oid)='UNIQUE (enrollment_id)')
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.academic_roster_registrations'::regclass
      AND contype='f' AND confdeltype='r' AND NOT condeferrable AND convalidated
      AND conname IN ('academic_roster_registrations_actor_fk','academic_roster_registrations_student_fk',
        'academic_roster_registrations_cohort_fk','academic_roster_registrations_enrollment_fk')) <> 4
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.academic_roster_registrations'::regclass
      AND contype='c' AND convalidated AND conname IN ('academic_roster_registrations_verification_method_check',
        'academic_roster_registrations_request_fingerprint_check')) <> 2
  THEN RAISE EXCEPTION 'roster_migration_constraint_mismatch'; END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('academic_roster_registrations_actor_fk', 'FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT'),
      ('academic_roster_registrations_student_fk', 'FOREIGN KEY (student_id) REFERENCES academic_students(id) ON DELETE RESTRICT'),
      ('academic_roster_registrations_cohort_fk', 'FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE RESTRICT'),
      ('academic_roster_registrations_enrollment_fk', 'FOREIGN KEY (enrollment_id) REFERENCES cohort_enrollments(id) ON DELETE RESTRICT'),
      ('academic_roster_registrations_verification_method_check', 'CHECK ((verification_method = ANY (ARRAY[''IN_PERSON''::text, ''VERIFIED_CONTACT''::text])))'),
      ('academic_roster_registrations_request_fingerprint_check', 'CHECK (((request_fingerprint)::text ~ ''^[0-9a-f]{64}$''::text))')
    ) AS expected(name, definition)
    LEFT JOIN pg_constraint c ON c.conrelid='public.academic_roster_registrations'::regclass AND c.conname::text=expected.name
    WHERE c.oid IS NULL OR pg_get_constraintdef(c.oid) <> expected.definition
  ) THEN RAISE EXCEPTION 'roster_migration_constraint_mismatch'; END IF;
END;
$verify$;
COMMENT ON TABLE public.academic_roster_registrations IS
  '등록 요청 멱등성 및 최소 승인 감사. 이름·이메일·연락처·증빙 원문은 저장하지 않는다.';

CREATE OR REPLACE FUNCTION public.register_academic_roster(
  p_request_id uuid, p_actor_id uuid, p_cohort_id uuid, p_student_id uuid,
  p_display_name text, p_verification_method text, p_evidence_reference uuid
) RETURNS TABLE(student_id uuid, enrollment_id uuid)
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  v_existing public.academic_roster_registrations%ROWTYPE;
  v_student_id uuid;
  v_enrollment_id uuid;
  v_fingerprint varchar(64);
BEGIN
  IF p_request_id IS NULL OR p_actor_id IS NULL OR p_cohort_id IS NULL
    OR p_evidence_reference IS NULL OR p_verification_method IS NULL
    OR p_verification_method NOT IN ('IN_PERSON', 'VERIFIED_CONTACT') THEN
    RAISE EXCEPTION 'roster_invalid_input';
  END IF;
  -- 기존 학생에 표시 이름을 함께 보내는 입력은 거부하고 이름으로 동일인을 추정하지 않는다.
  IF (p_student_id IS NOT NULL AND p_display_name IS NOT NULL)
    OR (p_student_id IS NULL AND (p_display_name IS NULL OR length(btrim(p_display_name)) = 0
      OR length(p_display_name) > 100 OR p_display_name <> btrim(p_display_name))) THEN
    RAISE EXCEPTION 'roster_invalid_input';
  END IF;
  v_fingerprint := encode(sha256(convert_to(jsonb_build_array(p_request_id, p_actor_id, p_cohort_id,
    p_student_id, p_display_name, p_verification_method, p_evidence_reference)::text, 'UTF8')), 'hex');
  -- 동일 요청 키의 동시 실행을 직렬화하여 신규 학생의 이중 생성도 막는다.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 146));
  SELECT * INTO v_existing FROM public.academic_roster_registrations r WHERE r.request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.request_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'roster_request_conflict';
    END IF;
    RETURN QUERY SELECT v_existing.student_id, v_existing.enrollment_id;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cohorts c WHERE c.id = p_cohort_id) THEN
    RAISE EXCEPTION 'roster_missing_cohort';
  END IF;
  IF p_student_id IS NULL THEN
    INSERT INTO public.academic_students(display_name) VALUES (p_display_name) RETURNING id INTO v_student_id;
  ELSE
    SELECT s.id INTO v_student_id FROM public.academic_students s WHERE s.id = p_student_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'roster_missing_student'; END IF;
  END IF;
  INSERT INTO public.cohort_enrollments(student_id, cohort_id, created_by_user_id)
    VALUES (v_student_id, p_cohort_id, p_actor_id) RETURNING id INTO v_enrollment_id;
  INSERT INTO public.academic_roster_registrations(request_id, actor_user_id, student_id, cohort_id,
    enrollment_id, verification_method, evidence_reference, request_fingerprint)
    VALUES (p_request_id, p_actor_id, v_student_id, p_cohort_id, v_enrollment_id,
      p_verification_method, p_evidence_reference, v_fingerprint);
  RETURN QUERY SELECT v_student_id, v_enrollment_id;
END;
$$;
-- 이 함수는 앱 DB 역할/소유자의 권한으로만 실행한다. 임의의 PUBLIC 실행 권한을 제거한다.
REVOKE ALL ON FUNCTION public.register_academic_roster(uuid,uuid,uuid,uuid,text,text,uuid) FROM PUBLIC;
