-- #145 수동 승인 연결·등록·감사. #144를 적용한 개발 DB에서 먼저 검증합니다.
-- SECURITY INVOKER를 유지하며 사용자 입력으로 DB 권한을 승격하지 않습니다.
BEGIN;
SET LOCAL search_path = public, pg_catalog;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public.academic_enrollment_link_batches (
  request_id uuid PRIMARY KEY,
  actor_user_id uuid NOT NULL CONSTRAINT academic_enrollment_link_batches_actor_user_id_users_id_fk
    REFERENCES public.users(id) ON DELETE RESTRICT,
  approval_reference_id uuid NOT NULL,
  verification_method text NOT NULL CHECK (verification_method IN ('IN_PERSON', 'VERIFIED_CONTACT')),
  plan jsonb NOT NULL,
  changes jsonb NOT NULL,
  linked_count integer NOT NULL CHECK (linked_count >= 0),
  enrolled_count integer NOT NULL CHECK (enrolled_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 기존 이름의 다른 테이블을 IF NOT EXISTS로 수용하지 않습니다.
-- 컬럼 순서·타입·NULL·기본값과 핵심 제약을 확인한 뒤에만 함수를 갱신합니다.
CREATE TEMP TABLE academic_link_expected_checks (
  verification_method text CHECK (verification_method IN ('IN_PERSON', 'VERIFIED_CONTACT')),
  linked_count integer CHECK (linked_count >= 0),
  enrolled_count integer CHECK (enrolled_count >= 0)
) ON COMMIT DROP;
DO $shape$
BEGIN
  IF (SELECT jsonb_agg(jsonb_build_array(a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull,
      COALESCE(pg_get_expr(d.adbin, d.adrelid), '')) ORDER BY a.attnum)
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = 'public.academic_enrollment_link_batches'::regclass
        AND a.attnum > 0 AND NOT a.attisdropped) IS DISTINCT FROM
    '[["request_id","uuid",true,""],["actor_user_id","uuid",true,""],
      ["approval_reference_id","uuid",true,""],["verification_method","text",true,""],
      ["plan","jsonb",true,""],["changes","jsonb",true,""],["linked_count","integer",true,""],
      ["enrolled_count","integer",true,""],["created_at","timestamp with time zone",true,"now()"]]'::jsonb
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.academic_enrollment_link_batches'::regclass
      AND conname = 'academic_enrollment_link_batches_pkey' AND contype = 'p' AND conkey = ARRAY[1]::smallint[])
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.academic_enrollment_link_batches'::regclass
      AND conname = 'academic_enrollment_link_batches_actor_user_id_users_id_fk' AND contype = 'f'
      AND conkey = ARRAY[2]::smallint[] AND confrelid = 'public.users'::regclass
      AND confkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.users'::regclass AND attname = 'id')]::smallint[]
      AND confdeltype = 'r' AND convalidated AND NOT condeferrable)
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.academic_enrollment_link_batches'::regclass
      AND contype = 'c' AND convalidated AND conname IN (
        'academic_enrollment_link_batches_verification_method_check',
        'academic_enrollment_link_batches_linked_count_check',
        'academic_enrollment_link_batches_enrolled_count_check')) <> 3
    OR (SELECT array_agg(pg_get_expr(conbin, conrelid) ORDER BY pg_get_expr(conbin, conrelid))
      FROM pg_constraint WHERE conrelid = 'public.academic_enrollment_link_batches'::regclass AND contype = 'c')
      IS DISTINCT FROM (SELECT array_agg(pg_get_expr(conbin, conrelid) ORDER BY pg_get_expr(conbin, conrelid))
      FROM pg_constraint WHERE conrelid = 'pg_temp.academic_link_expected_checks'::regclass AND contype = 'c') THEN
    RAISE EXCEPTION 'academic link audit table shape differs; review forward fix';
  END IF;
END;
$shape$;

-- 읽기 전용 후보 보고는 이름·이메일·토큰을 조회하거나 반환하지 않습니다.
CREATE OR REPLACE FUNCTION public.inspect_academic_enrollment_candidates()
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $report$
  SELECT jsonb_build_object(
    'memberCount', (SELECT count(*) FROM public.users WHERE role = 'MEMBER'),
    'studentCount', (SELECT count(*) FROM public.academic_students),
    'enrollmentCount', (SELECT count(*) FROM public.cohort_enrollments),
    'candidates', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'userId', u.id, 'cohortId', u.cohort_id, 'role', u.role,
      'studentId', s.id, 'hasMatchingEnrollment', EXISTS (
        SELECT 1 FROM public.cohort_enrollments e WHERE e.student_id = s.id AND e.cohort_id = u.cohort_id
      )) ORDER BY u.id)
      FROM public.users u JOIN public.cohorts c ON c.id = u.cohort_id
      LEFT JOIN public.academic_students s ON s.user_id = u.id
      WHERE u.role = 'MEMBER'), '[]'::jsonb),
    'missingCohortUserIds', COALESCE((SELECT jsonb_agg(id ORDER BY id)
      FROM public.users WHERE role = 'MEMBER' AND cohort_id IS NULL), '[]'::jsonb),
    'invalidCohortUserIds', COALESCE((SELECT jsonb_agg(u.id ORDER BY u.id)
      FROM public.users u LEFT JOIN public.cohorts c ON c.id = u.cohort_id
      WHERE u.cohort_id IS NOT NULL AND c.id IS NULL), '[]'::jsonb),
    'unlinkedStudentIds', COALESCE((SELECT jsonb_agg(id ORDER BY id)
      FROM public.academic_students WHERE user_id IS NULL), '[]'::jsonb),
    'roleMismatchUserIds', COALESCE((SELECT jsonb_agg(u.id ORDER BY u.id)
      FROM public.users u JOIN public.academic_students s ON s.user_id = u.id
      WHERE u.role <> 'MEMBER'), '[]'::jsonb),
    'cohortDifferences', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'studentId', s.id, 'userId', u.id, 'enrollmentId', e.id, 'cohortId', e.cohort_id) ORDER BY e.id)
      FROM public.academic_students s JOIN public.users u ON u.id = s.user_id
      JOIN public.cohort_enrollments e ON e.student_id = s.id
      WHERE e.cohort_id IS DISTINCT FROM u.cohort_id), '[]'::jsonb),
    'duplicateUserIds', COALESCE((SELECT jsonb_agg(user_id ORDER BY user_id) FROM (
      SELECT user_id FROM public.academic_students WHERE user_id IS NOT NULL
      GROUP BY user_id HAVING count(*) > 1) duplicates), '[]'::jsonb),
    'duplicateEnrollments', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'studentId', student_id, 'cohortId', cohort_id)) FROM (
      SELECT student_id, cohort_id FROM public.cohort_enrollments
      GROUP BY student_id, cohort_id HAVING count(*) > 1) duplicates), '[]'::jsonb)
  );
$report$;

CREATE OR REPLACE FUNCTION public.apply_academic_enrollment_links(
  p_actor_id uuid, p_configured_approver_id uuid, p_plan jsonb
) RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog, public AS $apply$
DECLARE
  v_request uuid;
  v_approval uuid;
  v_method text;
  v_link jsonb;
  v_user public.users%ROWTYPE;
  v_student public.academic_students%ROWTYPE;
  v_existing public.academic_enrollment_link_batches%ROWTYPE;
  v_linked integer := 0;
  v_enrolled integer := 0;
  v_changed integer;
  v_changes jsonb := '[]'::jsonb;
  v_previous uuid;
BEGIN
  -- DB에서도 입력 형식을 검증해 CLI 외 호출에 동일한 경계를 적용합니다.
  IF p_actor_id IS NULL OR p_configured_approver_id IS NULL OR p_actor_id <> p_configured_approver_id
    OR jsonb_typeof(p_plan) IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(p_plan)) <> 5
    OR p_plan->>'approverUserId' IS DISTINCT FROM p_actor_id::text
    OR p_plan->>'verificationMethod' IS NULL
    OR p_plan->>'verificationMethod' NOT IN ('IN_PERSON', 'VERIFIED_CONTACT')
    OR jsonb_typeof(p_plan->'links') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'academic approval plan rejected';
  END IF;
  v_request := (p_plan->>'requestId')::uuid;
  v_approval := (p_plan->>'approvalReferenceId')::uuid;
  v_method := p_plan->>'verificationMethod';
  IF v_request IS NULL OR v_approval IS NULL OR jsonb_array_length(p_plan->'links') NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'academic approval plan rejected';
  END IF;
  FOR v_link IN SELECT value FROM jsonb_array_elements(p_plan->'links') LOOP
    IF jsonb_typeof(v_link) IS DISTINCT FROM 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(v_link)) <> 5
      OR NOT (v_link ?& ARRAY['studentId', 'userId', 'cohortId', 'expectedRole', 'expectedCohortId'])
      OR v_link->>'studentId' IS NULL OR v_link->>'userId' IS NULL OR v_link->>'cohortId' IS NULL
      OR v_link->>'expectedRole' IS NULL OR v_link->>'expectedRole' NOT IN ('ADMIN', 'FACULTY', 'MEMBER') THEN
      RAISE EXCEPTION 'academic link entry rejected';
    END IF;
    -- UUID 변환 실패도 문장 전체를 롤백합니다. 호출자는 오류 원문을 출력하지 않습니다.
    PERFORM (v_link->>'studentId')::uuid, (v_link->>'userId')::uuid,
      (v_link->>'cohortId')::uuid, (v_link->>'expectedCohortId')::uuid;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'links') l
      GROUP BY (l->>'studentId')::uuid HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'links') l
      GROUP BY (l->>'userId')::uuid HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'duplicate academic link entry';
  END IF;

  -- 요청 ID 재시도와 동일 학생·계정 경합을 같은 잠금 순서로 직렬화합니다.
  PERFORM pg_advisory_xact_lock(hashtextextended('academic-link:' || v_request::text, 0));
  PERFORM id FROM public.users WHERE id = p_actor_id OR id IN (
    SELECT (value->>'userId')::uuid FROM jsonb_array_elements(p_plan->'links')
  ) ORDER BY id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_actor_id AND role IN ('ADMIN', 'FACULTY', 'MEMBER')) THEN
    RAISE EXCEPTION 'academic approver unavailable';
  END IF;
  PERFORM id FROM public.academic_students WHERE id IN (
    SELECT (value->>'studentId')::uuid FROM jsonb_array_elements(p_plan->'links')
  ) ORDER BY id FOR UPDATE;
  PERFORM id FROM public.cohorts WHERE id IN (
    SELECT (value->>'cohortId')::uuid FROM jsonb_array_elements(p_plan->'links')
  ) ORDER BY id FOR KEY SHARE;

  SELECT * INTO v_existing FROM public.academic_enrollment_link_batches WHERE request_id = v_request;
  IF FOUND THEN
    IF v_existing.actor_user_id <> p_actor_id OR v_existing.plan <> p_plan THEN
      RAISE EXCEPTION 'academic request id reused with different plan';
    END IF;
    RETURN jsonb_build_object('requestId', v_request, 'linkedCount', v_existing.linked_count,
      'enrolledCount', v_existing.enrolled_count, 'replayed', true);
  END IF;

  FOR v_link IN SELECT value FROM jsonb_array_elements(p_plan->'links') ORDER BY value->>'studentId' LOOP
    SELECT * INTO v_user FROM public.users WHERE id = (v_link->>'userId')::uuid;
    IF NOT FOUND OR v_user.role = 'PENDING'
      OR v_user.role::text IS DISTINCT FROM v_link->>'expectedRole'
      OR v_user.cohort_id IS DISTINCT FROM (v_link->>'expectedCohortId')::uuid THEN
      RAISE EXCEPTION 'academic account changed or unavailable';
    END IF;
    SELECT * INTO v_student FROM public.academic_students WHERE id = (v_link->>'studentId')::uuid;
    IF NOT FOUND OR (v_student.user_id IS NOT NULL AND v_student.user_id <> v_user.id)
      OR NOT EXISTS (SELECT 1 FROM public.cohorts WHERE id = (v_link->>'cohortId')::uuid) THEN
      RAISE EXCEPTION 'academic student or cohort unavailable';
    END IF;
    IF EXISTS (SELECT 1 FROM public.academic_students WHERE user_id = v_user.id AND id <> v_student.id) THEN
      RAISE EXCEPTION 'academic account already linked';
    END IF;
    v_previous := v_student.user_id;
    UPDATE public.academic_students SET user_id = v_user.id, updated_at = now()
      WHERE id = v_student.id AND user_id IS NULL;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    v_linked := v_linked + v_changed;
    INSERT INTO public.cohort_enrollments (student_id, cohort_id, created_by_user_id)
      VALUES (v_student.id, (v_link->>'cohortId')::uuid, p_actor_id)
      ON CONFLICT (student_id, cohort_id) DO NOTHING;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    v_enrolled := v_enrolled + v_changed;
    v_changes := v_changes || jsonb_build_array(jsonb_build_object('studentId', v_student.id,
      'previousUserId', v_previous, 'userId', v_user.id, 'cohortId', v_link->>'cohortId',
      'enrollmentCreated', v_changed = 1));
  END LOOP;
  -- 감사 기록 실패도 앞선 모든 연결·등록을 취소합니다.
  INSERT INTO public.academic_enrollment_link_batches
    (request_id, actor_user_id, approval_reference_id, verification_method, plan, changes, linked_count, enrolled_count)
    VALUES (v_request, p_actor_id, v_approval, v_method, p_plan, v_changes, v_linked, v_enrolled);
  RETURN jsonb_build_object('requestId', v_request, 'linkedCount', v_linked,
    'enrolledCount', v_enrolled, 'replayed', false);
END;
$apply$;
COMMIT;
