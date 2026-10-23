-- #280 소유 로컬 fresh 후보: 운영 적용·실제 과거 적용 이력이 아닙니다.
-- 원본 참조: scripts/migrate-academic-assignment-actions.sql
-- 검토 원본 SHA256: b1d51af3fbe81172d0dc4d86b54e2909dadfcab3e7eff4b8c683c4a27144392a
-- reviewedDelta: 3행 BEGIN; → 제외; 6행 SET LOCAL statement_timeout = '60s'; → 제외; 181행 COMMIT; → 제외
-- 원본→후보 보존 행: 1-2→11-12; 4-5→13-14; 7-180→15-188
-- 사유: 파일 transaction은 S2가 소유하며 설치 statement timeout은 더 강한 engine 한도를 적용합니다.
-- 보존: 내부 BEGIN/END·search_path·advisory lock·함수 본문/proconfig·ACL·FK/trigger·임시 expected 객체.
-- namespaceDelta: 없음. app DDL은 기존 public 명시, TEMP/INDEX는 PostgreSQL의 원래 namespace 규칙을 보존합니다.
-- 상태: S2 기본 timeoutMs=10000의 statement=7500ms/lock=5000ms/idle=10000ms 전제이며 전체 prefix 대조는 별도입니다.

-- #149 지정 책임자의 과제 변경과 최소 감사. #144·#147 범위 SQL이 선행합니다.
-- 운영 개인정보 저장 활성화는 #142 정책·별도 운영 승인이 선행합니다.
SET LOCAL search_path = public, pg_catalog;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtextextended('hra:academic-assignment-actions:v1', 0));

CREATE TABLE IF NOT EXISTS public.academic_assignment_events (
  request_id uuid PRIMARY KEY,
  assignment_id uuid NOT NULL CONSTRAINT academic_assignment_events_assignment_id_assignments_id_fk
    REFERENCES public.assignments(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL CONSTRAINT academic_assignment_events_actor_user_id_users_id_fk
    REFERENCES public.users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  previous_status text,
  next_status text NOT NULL,
  correlation_id uuid NOT NULL,
  payload_digest varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_assignment_events_action_check CHECK (action IN ('CREATE','UPDATE_DRAFT','PUBLISH','CLOSE')),
  CONSTRAINT academic_assignment_events_previous_status_check CHECK (previous_status IS NULL OR previous_status IN ('DRAFT','PUBLISHED','CLOSED')),
  CONSTRAINT academic_assignment_events_next_status_check CHECK (next_status IN ('DRAFT','PUBLISHED','CLOSED')),
  CONSTRAINT academic_assignment_events_payload_digest_check CHECK (payload_digest ~ '^[0-9a-f]{64}$')
);

-- 이름만 같은 다른 감사 테이블은 수용하지 않습니다. CHECK 표현식도 실제 파서 결과로 비교합니다.
CREATE TEMP TABLE academic_assignment_expected_checks (
  action text CHECK (action IN ('CREATE','UPDATE_DRAFT','PUBLISH','CLOSE')),
  previous_status text CHECK (previous_status IS NULL OR previous_status IN ('DRAFT','PUBLISHED','CLOSED')),
  next_status text CHECK (next_status IN ('DRAFT','PUBLISHED','CLOSED')),
  payload_digest varchar(64) CHECK (payload_digest ~ '^[0-9a-f]{64}$')
) ON COMMIT DROP;
DO $shape$
DECLARE expected record;
BEGIN
  IF (SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
      COALESCE(pg_get_expr(d.adbin,d.adrelid),'')) ORDER BY a.attnum)
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public.academic_assignment_events'::regclass AND a.attnum>0 AND NOT a.attisdropped)
    IS DISTINCT FROM '[["request_id","uuid",true,""],["assignment_id","uuid",true,""],
      ["actor_user_id","uuid",true,""],["action","text",true,""],["previous_status","text",false,""],
      ["next_status","text",true,""],["correlation_id","uuid",true,""],
      ["payload_digest","character varying(64)",true,""],["created_at","timestamp with time zone",true,"now()"]]'::jsonb THEN
    RAISE EXCEPTION '과제 감사 테이블 컬럼이 다릅니다. 별도 복구 검토가 필요합니다.';
  END IF;
  FOR expected IN SELECT * FROM (VALUES
    ('academic_assignment_events_pkey','PRIMARY KEY (request_id)'),
    ('academic_assignment_events_assignment_id_assignments_id_fk','FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE RESTRICT'),
    ('academic_assignment_events_actor_user_id_users_id_fk','FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT')
  ) definitions(name,definition) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.academic_assignment_events'::regclass
      AND conname=expected.name AND convalidated AND NOT condeferrable
      AND pg_get_constraintdef(oid)=expected.definition) THEN
      RAISE EXCEPTION '과제 감사 테이블 참조 제약이 다릅니다.';
    END IF;
  END LOOP;
  IF (SELECT array_agg(pg_get_expr(conbin,conrelid) ORDER BY pg_get_expr(conbin,conrelid))
      FROM pg_constraint WHERE conrelid='public.academic_assignment_events'::regclass AND contype='c' AND convalidated)
    IS DISTINCT FROM (SELECT array_agg(pg_get_expr(conbin,conrelid) ORDER BY pg_get_expr(conbin,conrelid))
      FROM pg_constraint WHERE conrelid='pg_temp.academic_assignment_expected_checks'::regclass AND contype='c')
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.academic_assignment_events'::regclass AND contype<>'n')<>7
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.academic_assignment_events'::regclass
      AND contype='c' AND conname IN ('academic_assignment_events_action_check',
        'academic_assignment_events_previous_status_check','academic_assignment_events_next_status_check',
        'academic_assignment_events_payload_digest_check'))<>4
    OR (SELECT count(*) FROM pg_index WHERE indrelid='public.academic_assignment_events'::regclass AND indisvalid AND indisready)<>1
    OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.academic_assignment_events'::regclass AND NOT tgisinternal)
    OR EXISTS (SELECT 1 FROM pg_class WHERE oid='public.academic_assignment_events'::regclass
      AND (relkind<>'r' OR relrowsecurity OR relforcerowsecurity)) THEN
    RAISE EXCEPTION '과제 감사 테이블 CHECK 또는 구조가 다릅니다.';
  END IF;
END;
$shape$;

-- SQL은 인자를 신뢰하지 않습니다. 웹 서비스가 읽은 지정 계정과 현재 승인 역할을 함께 재검증합니다.
CREATE OR REPLACE FUNCTION public.mutate_academic_assignment(
  p_action text, p_actor_id uuid, p_configured_approver_id uuid,
  p_request_id uuid, p_correlation_id uuid, p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog,public AS $mutate$
DECLARE
  definition public.assignments;
  prior public.academic_assignment_events;
  payload_digest text;
  previous_status text;
  expected_keys text[];
  target_fingerprint text;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('CREATE','UPDATE_DRAFT','PUBLISH','CLOSE')
    OR p_actor_id IS NULL OR p_configured_approver_id IS NULL OR p_actor_id<>p_configured_approver_id
    OR p_request_id IS NULL OR p_correlation_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE SQLSTATE 'HRA07' USING MESSAGE='과제 변경 요청이 올바르지 않습니다.';
  END IF;
  expected_keys := CASE p_action
    WHEN 'CREATE' THEN ARRAY['cohortId','scheduleEventId','scheduleSessionId','title','instructions','dueAt']
    WHEN 'UPDATE_DRAFT' THEN ARRAY['cohortId','scheduleEventId','scheduleSessionId','title','instructions','dueAt','assignmentId','expectedUpdatedAt']
    WHEN 'PUBLISH' THEN ARRAY['assignmentId','expectedUpdatedAt','expectedTargetFingerprint']
    ELSE ARRAY['assignmentId'] END;
  IF NOT (p_payload ?& expected_keys) OR (SELECT count(*) FROM jsonb_object_keys(p_payload))<>cardinality(expected_keys) THEN
    RAISE SQLSTATE 'HRA07' USING MESSAGE='과제 입력 필드가 올바르지 않습니다.';
  END IF;
  IF p_action IN ('CREATE','UPDATE_DRAFT') AND (
    jsonb_typeof(p_payload->'title') IS DISTINCT FROM 'string'
    OR length(btrim(p_payload->>'title')) NOT BETWEEN 1 AND 200
    OR jsonb_typeof(p_payload->'instructions') IS DISTINCT FROM 'string'
    OR length(p_payload->>'instructions')>50000 OR p_payload->>'cohortId' IS NULL) THEN
    RAISE SQLSTATE 'HRA07' USING MESSAGE='과제 제목·본문·기수를 확인해 주세요.';
  END IF;
  IF p_action<>'CREATE' AND p_payload->>'assignmentId' IS NULL THEN
    RAISE SQLSTATE 'HRA07' USING MESSAGE='과제 ID가 필요합니다.';
  END IF;
  -- 저장 본문 대신 SHA-256 요약만 기록합니다. 확장 설치 없이 PostgreSQL 기본 함수를 사용합니다.
  payload_digest := encode(sha256(convert_to(p_action || ':' || p_payload::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('academic-assignment-request:' || p_request_id::text,0));
  PERFORM id FROM public.users WHERE id=p_actor_id AND role IN ('ADMIN','FACULTY','MEMBER') FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'HRA01' USING MESSAGE='학사 운영 책임자 계정을 사용할 수 없습니다.'; END IF;
  SELECT * INTO prior FROM public.academic_assignment_events WHERE request_id=p_request_id;
  IF FOUND THEN
    IF prior.actor_user_id<>p_actor_id OR prior.action<>p_action OR prior.payload_digest<>payload_digest THEN
      RAISE SQLSTATE 'HRA02' USING MESSAGE='같은 요청 ID를 다른 변경에 사용할 수 없습니다.';
    END IF;
    SELECT * INTO definition FROM public.assignments WHERE id=prior.assignment_id;
    RETURN jsonb_build_object('assignment',to_jsonb(definition),'targetCount',
      (SELECT count(*) FROM public.assignment_targets WHERE assignment_id=definition.id),'replayed',true);
  END IF;

  IF p_action='CREATE' THEN
    INSERT INTO public.assignments (cohort_id,schedule_event_id,schedule_session_id,title,instructions,due_at,created_by_user_id)
      VALUES ((p_payload->>'cohortId')::uuid,(p_payload->>'scheduleEventId')::uuid,
        (p_payload->>'scheduleSessionId')::uuid,btrim(p_payload->>'title'),p_payload->>'instructions',
        (p_payload->>'dueAt')::timestamptz,p_actor_id) RETURNING * INTO definition;
  ELSE
    SELECT * INTO definition FROM public.assignments WHERE id=(p_payload->>'assignmentId')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE SQLSTATE 'HRA03' USING MESSAGE='과제를 찾을 수 없습니다.'; END IF;
    previous_status := definition.status::text;
    IF p_action='UPDATE_DRAFT' THEN
      IF definition.status<>'DRAFT' THEN RAISE SQLSTATE 'HRA04' USING MESSAGE='공개 후에는 과제 내용을 수정할 수 없습니다.'; END IF;
      IF p_payload->>'expectedUpdatedAt' IS NULL OR definition.updated_at IS DISTINCT FROM (p_payload->>'expectedUpdatedAt')::timestamptz THEN
        RAISE SQLSTATE 'HRA05' USING MESSAGE='과제가 다른 요청으로 수정되었습니다. 다시 조회해 주세요.';
      END IF;
      UPDATE public.assignments SET cohort_id=(p_payload->>'cohortId')::uuid,
        schedule_event_id=(p_payload->>'scheduleEventId')::uuid,schedule_session_id=(p_payload->>'scheduleSessionId')::uuid,
        title=btrim(p_payload->>'title'),instructions=p_payload->>'instructions',due_at=(p_payload->>'dueAt')::timestamptz
        WHERE id=definition.id RETURNING * INTO definition;
    ELSIF p_action='PUBLISH' THEN
      IF p_payload->>'expectedUpdatedAt' IS NULL OR p_payload->>'expectedTargetFingerprint' IS NULL
        OR p_payload->>'expectedTargetFingerprint' !~ '^[0-9a-f]{64}$' THEN
        RAISE SQLSTATE 'HRA07' USING MESSAGE='공개 확인 버전과 대상 명부 확인값이 필요합니다.';
      END IF;
      IF definition.status='DRAFT' AND definition.updated_at IS DISTINCT FROM (p_payload->>'expectedUpdatedAt')::timestamptz THEN
        RAISE SQLSTATE 'HRA05' USING MESSAGE='과제가 다른 요청으로 수정되었습니다. 다시 조회해 주세요.';
      END IF;
      IF definition.status='DRAFT' AND (definition.due_at IS NULL OR definition.due_at<=clock_timestamp()) THEN
        RAISE SQLSTATE 'HRA08' USING MESSAGE='과제 공개에는 미래 마감 시각이 필요합니다.';
      END IF;
      -- 최초 공개의 명부 잠금·시각·대상 스냅샷과 멱등성은 #147 함수에 맡깁니다.
      SELECT * INTO definition FROM public.publish_academic_assignment(definition.id,p_actor_id);
      IF previous_status='DRAFT' THEN
        SELECT encode(sha256(convert_to(COALESCE(string_agg(enrollment_id::text,',' ORDER BY enrollment_id),''),'UTF8')),'hex')
          INTO target_fingerprint FROM public.assignment_targets WHERE assignment_id=definition.id;
        IF target_fingerprint IS DISTINCT FROM p_payload->>'expectedTargetFingerprint' THEN
          RAISE SQLSTATE 'HRA09' USING MESSAGE='공개 확인 이후 대상 명부가 변경되었습니다.';
        END IF;
      END IF;
    ELSE
      IF definition.status='DRAFT' THEN RAISE SQLSTATE 'HRA06' USING MESSAGE='초안은 바로 종료할 수 없습니다.'; END IF;
      IF definition.status='PUBLISHED' THEN
        UPDATE public.assignments SET status='CLOSED' WHERE id=definition.id RETURNING * INTO definition;
      END IF;
    END IF;
  END IF;

  -- 감사 실패나 공개 대상 생성 실패도 이번 변경을 전부 롤백합니다.
  INSERT INTO public.academic_assignment_events
    (request_id,assignment_id,actor_user_id,action,previous_status,next_status,correlation_id,payload_digest)
    VALUES (p_request_id,definition.id,p_actor_id,p_action,previous_status,definition.status::text,p_correlation_id,payload_digest);
  RETURN jsonb_build_object('assignment',to_jsonb(definition),'targetCount',
    (SELECT count(*) FROM public.assignment_targets WHERE assignment_id=definition.id),'replayed',false);
END;
$mutate$;
