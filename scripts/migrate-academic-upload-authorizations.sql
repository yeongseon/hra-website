-- #151: 의도 발급·원본 검증·미참조 객체 정리. #144→#147→#148 뒤에 적용한다.
-- 실제 Blob 쓰기와 삭제는 이 SQL에서 하지 않는다. 정리는 별도 비활성 기본 작업이다.
BEGIN;
SET LOCAL search_path=public,pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(hashtextextended('hra:academic-upload-authorizations:v1',0));
CREATE TABLE IF NOT EXISTS public.academic_upload_authorizations (
  intent_id uuid PRIMARY KEY CONSTRAINT academic_upload_authorizations_intent_fk REFERENCES public.assignment_upload_intents(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL CONSTRAINT academic_upload_authorizations_request_id_unique UNIQUE,
  target_id uuid NOT NULL CONSTRAINT academic_upload_authorizations_target_fk REFERENCES public.assignment_targets(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL CONSTRAINT academic_upload_authorizations_user_fk REFERENCES public.users(id) ON DELETE RESTRICT,
  original_name varchar(255) NOT NULL,
  expected_size integer NOT NULL,
  received_at timestamptz,
  verified_etag varchar(255),
  retired_at timestamptz,
  cleanup_claimed_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT academic_upload_authorizations_size_check CHECK (expected_size BETWEEN 1 AND 52428800),
  CONSTRAINT academic_upload_authorizations_name_check CHECK (length(btrim(original_name))>0 AND original_name !~ '[/\\[:cntrl:]]' AND lower(original_name) LIKE '%.pdf')
);
CREATE UNIQUE INDEX IF NOT EXISTS academic_upload_authorizations_active_target_idx
  ON public.academic_upload_authorizations(target_id) WHERE retired_at IS NULL;
CREATE INDEX IF NOT EXISTS academic_upload_authorizations_cleanup_idx ON public.academic_upload_authorizations(cleanup_claimed_at);
CREATE SCHEMA hra_upload151_expected;
CREATE TABLE hra_upload151_expected.expected (
  intent_id uuid PRIMARY KEY CONSTRAINT academic_upload_authorizations_intent_fk REFERENCES public.assignment_upload_intents(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL CONSTRAINT academic_upload_authorizations_request_id_unique UNIQUE,
  target_id uuid NOT NULL CONSTRAINT academic_upload_authorizations_target_fk REFERENCES public.assignment_targets(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL CONSTRAINT academic_upload_authorizations_user_fk REFERENCES public.users(id) ON DELETE RESTRICT,
  original_name varchar(255) NOT NULL,
  expected_size integer NOT NULL,
  received_at timestamptz,
  verified_etag varchar(255),
  retired_at timestamptz,
  cleanup_claimed_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT academic_upload_authorizations_size_check CHECK (expected_size BETWEEN 1 AND 52428800),
  CONSTRAINT academic_upload_authorizations_name_check CHECK (length(btrim(original_name))>0 AND original_name !~ '[/\\[:cntrl:]]' AND lower(original_name) LIKE '%.pdf')
);
CREATE UNIQUE INDEX hra_upload151_expected_active ON hra_upload151_expected.expected(target_id) WHERE retired_at IS NULL;
CREATE INDEX hra_upload151_expected_cleanup ON hra_upload151_expected.expected(cleanup_claimed_at);
DO $shape$
DECLARE actual_shape jsonb; expected_shape jsonb;
BEGIN
  IF (SELECT jsonb_agg(jsonb_build_array(attname,format_type(atttypid,atttypmod),attnotnull) ORDER BY attnum)
    FROM pg_attribute WHERE attrelid='public.academic_upload_authorizations'::regclass AND attnum>0 AND NOT attisdropped)
    IS DISTINCT FROM '[["intent_id","uuid",true],["request_id","uuid",true],["target_id","uuid",true],["user_id","uuid",true],["original_name","character varying(255)",true],["expected_size","integer",true],["received_at","timestamp with time zone",false],["verified_etag","character varying(255)",false],["retired_at","timestamp with time zone",false],["cleanup_claimed_at","timestamp with time zone",false],["deleted_at","timestamp with time zone",false]]'::jsonb
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.academic_upload_authorizations'::regclass AND contype<>'n')<>7
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.academic_upload_authorizations'::regclass AND contype='f' AND confdeltype='r' AND convalidated AND NOT condeferrable)<>3
    OR EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.academic_upload_authorizations'::regclass)
  THEN RAISE EXCEPTION 'upload_migration_mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid='public.academic_upload_authorizations'::regclass AND (relrowsecurity OR relforcerowsecurity)) THEN
    RAISE EXCEPTION 'upload_migration_mismatch'; END IF;
  SELECT jsonb_agg(jsonb_build_array(contype,convalidated,condeferrable,condeferred,pg_get_constraintdef(oid)) ORDER BY pg_get_constraintdef(oid))
    INTO actual_shape FROM pg_constraint WHERE conrelid='public.academic_upload_authorizations'::regclass AND contype<>'n';
  SELECT jsonb_agg(jsonb_build_array(contype,convalidated,condeferrable,condeferred,pg_get_constraintdef(oid)) ORDER BY pg_get_constraintdef(oid))
    INTO expected_shape FROM pg_constraint WHERE conrelid='hra_upload151_expected.expected'::regclass AND contype<>'n';
  IF actual_shape IS DISTINCT FROM expected_shape THEN RAISE EXCEPTION 'upload_migration_mismatch'; END IF;
  SELECT jsonb_agg(jsonb_build_array(indisunique,indisprimary,indisvalid,indisready,indnatts,indnkeyatts,indkey::text,indclass::text,indcollation::text,indoption::text,pg_get_expr(indexprs,indrelid),pg_get_indexdef(indexrelid,1,true),pg_get_expr(indpred,indrelid)) ORDER BY pg_get_indexdef(indexrelid,1,true),indisprimary)
    INTO actual_shape FROM pg_index WHERE indrelid='public.academic_upload_authorizations'::regclass;
  SELECT jsonb_agg(jsonb_build_array(indisunique,indisprimary,indisvalid,indisready,indnatts,indnkeyatts,indkey::text,indclass::text,indcollation::text,indoption::text,pg_get_expr(indexprs,indrelid),pg_get_indexdef(indexrelid,1,true),pg_get_expr(indpred,indrelid)) ORDER BY pg_get_indexdef(indexrelid,1,true),indisprimary)
    INTO expected_shape FROM pg_index WHERE indrelid='hra_upload151_expected.expected'::regclass;
  IF actual_shape IS DISTINCT FROM expected_shape THEN RAISE EXCEPTION 'upload_migration_mismatch'; END IF;
END;
$shape$;
DROP SCHEMA hra_upload151_expected CASCADE;

-- 모든 사용자 쓰기는 대상→계정/학적/과제→의도→발급 원장 순으로 잠근다.
CREATE OR REPLACE FUNCTION public.authorize_academic_assignment_upload(p_intent uuid,p_actor uuid)
RETURNS public.academic_upload_authorizations LANGUAGE plpgsql SET search_path=pg_catalog,public AS $authorize$
DECLARE intent public.assignment_upload_intents; v_auth public.academic_upload_authorizations; target uuid;
BEGIN
  SELECT assignment_target_id INTO target FROM public.assignment_upload_intents WHERE id=p_intent;
  IF NOT FOUND THEN RAISE EXCEPTION 'upload_not_found'; END IF;
  PERFORM 1 FROM public.assignment_targets WHERE id=target FOR UPDATE;
  PERFORM public.assert_academic_submission_owner(target,p_actor,true);
  SELECT * INTO intent FROM public.assignment_upload_intents WHERE id=p_intent FOR UPDATE;
  SELECT * INTO v_auth FROM public.academic_upload_authorizations WHERE intent_id=p_intent FOR UPDATE;
  IF NOT FOUND OR v_auth.user_id IS DISTINCT FROM p_actor OR intent.user_id IS DISTINCT FROM p_actor
    OR v_auth.target_id IS DISTINCT FROM intent.assignment_target_id THEN RAISE EXCEPTION 'upload_not_found'; END IF;
  IF clock_timestamp()>=intent.expires_at THEN RAISE EXCEPTION 'upload_expired'; END IF;
  IF v_auth.retired_at IS NOT NULL OR v_auth.cleanup_claimed_at IS NOT NULL
    OR intent.state NOT IN ('INTENDED','VERIFIED')
    OR EXISTS (SELECT 1 FROM public.assignment_submissions WHERE assignment_target_id=target) THEN RAISE EXCEPTION 'upload_conflict'; END IF;
  RETURN v_auth;
END;
$authorize$;

CREATE OR REPLACE FUNCTION public.issue_academic_assignment_upload(p_request uuid,p_target uuid,p_actor uuid,p_name text,p_size integer)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,public AS $issue$
DECLARE previous public.academic_upload_authorizations; intent_id uuid; expiry timestamptz;
BEGIN
  IF p_request IS NULL OR p_target IS NULL OR p_actor IS NULL OR p_name IS NULL OR p_size IS NULL
    OR p_size NOT BETWEEN 1 AND 52428800 OR length(p_name)>255 OR length(btrim(p_name))=0
    OR p_name<>btrim(p_name) OR p_name ~ '[/\\[:cntrl:]]' OR lower(p_name) NOT LIKE '%.pdf' THEN RAISE EXCEPTION 'upload_invalid_file'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,151));
  PERFORM 1 FROM public.assignment_targets WHERE id=p_target FOR UPDATE;
  PERFORM public.assert_academic_submission_owner(p_target,p_actor,true);
  SELECT * INTO previous FROM public.academic_upload_authorizations WHERE request_id=p_request;
  IF FOUND THEN
    IF ROW(previous.target_id,previous.user_id,previous.original_name,previous.expected_size)
      IS DISTINCT FROM ROW(p_target,p_actor,p_name,p_size) THEN RAISE EXCEPTION 'upload_conflict'; END IF;
    PERFORM public.authorize_academic_assignment_upload(previous.intent_id,p_actor);
    RETURN previous.intent_id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.assignment_submissions WHERE assignment_target_id=p_target) THEN RAISE EXCEPTION 'upload_conflict'; END IF;
  IF EXISTS (SELECT 1 FROM public.academic_upload_authorizations a JOIN public.assignment_upload_intents i ON i.id=a.intent_id
    WHERE a.target_id=p_target AND a.retired_at IS NULL AND i.expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'upload_conflict'; END IF;
  UPDATE public.academic_upload_authorizations SET retired_at=clock_timestamp() WHERE target_id=p_target AND retired_at IS NULL;
  SELECT least(clock_timestamp()+interval '15 minutes',a.due_at) INTO expiry
    FROM public.assignments a JOIN public.assignment_targets t ON t.assignment_id=a.id WHERE t.id=p_target;
  intent_id=gen_random_uuid();
  INSERT INTO public.assignment_upload_intents(id,assignment_target_id,user_id,storage_key,expires_at)
    VALUES(intent_id,p_target,p_actor,'academic-uploads/v1/'||intent_id::text||'/document.pdf',expiry);
  INSERT INTO public.academic_upload_authorizations(intent_id,request_id,target_id,user_id,original_name,expected_size)
    VALUES(intent_id,p_request,p_target,p_actor,p_name,p_size);
  RETURN intent_id;
END;
$issue$;

CREATE OR REPLACE FUNCTION public.verify_authorized_academic_upload(p_intent uuid,p_actor uuid,p_checksum text,p_etag text)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $verify$
DECLARE v_auth public.academic_upload_authorizations; intent public.assignment_upload_intents;
BEGIN
  v_auth=public.authorize_academic_assignment_upload(p_intent,p_actor);
  SELECT * INTO intent FROM public.assignment_upload_intents WHERE id=p_intent;
  IF p_etag IS NULL OR length(p_etag) NOT BETWEEN 1 AND 255 OR p_checksum IS NULL OR p_checksum !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'upload_invalid_file'; END IF;
  IF intent.state='INTENDED' THEN
    PERFORM public.verify_academic_assignment_upload(p_intent,p_actor,v_auth.original_name,'application/pdf',v_auth.expected_size,p_checksum);
  ELSIF ROW(intent.original_name,intent.mime_type,intent.size_bytes,intent.checksum)
    IS DISTINCT FROM ROW(v_auth.original_name,'application/pdf'::varchar,v_auth.expected_size,p_checksum::varchar)
    OR (v_auth.verified_etag IS NOT NULL AND v_auth.verified_etag<>p_etag) THEN RAISE EXCEPTION 'upload_conflict'; END IF;
  UPDATE public.academic_upload_authorizations SET verified_etag=p_etag WHERE intent_id=p_intent;
END;
$verify$;

-- 기대 대상 검사를 생략하는 이전 서명을 남기지 않고 새 진입점으로 교체한다.
DROP FUNCTION IF EXISTS public.cancel_academic_assignment_upload(uuid,uuid);
CREATE OR REPLACE FUNCTION public.cancel_academic_assignment_upload(p_intent uuid,p_actor uuid,p_expected_target uuid)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $cancel$
DECLARE intent public.assignment_upload_intents; v_auth public.academic_upload_authorizations;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'upload_conflict'; END IF;
  -- 타인의 의도와 API에서 선택한 과제가 다른 의도는 존재 여부를 구분하지 않는다.
  SELECT * INTO v_auth FROM public.academic_upload_authorizations WHERE intent_id=p_intent;
  IF NOT FOUND OR v_auth.user_id IS DISTINCT FROM p_actor
    OR v_auth.target_id IS DISTINCT FROM p_expected_target THEN RAISE EXCEPTION 'upload_not_found'; END IF;
  -- 최종화와 같은 대상 → 계정 → 학생/학적 → 과제 → 의도 → 원장 순서로 잠근다.
  PERFORM 1 FROM public.assignment_targets WHERE id=p_expected_target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'upload_not_found'; END IF;
  PERFORM public.assert_academic_submission_owner(p_expected_target,p_actor,false);
  SELECT * INTO intent FROM public.assignment_upload_intents WHERE id=p_intent FOR UPDATE;
  IF NOT FOUND OR intent.assignment_target_id IS DISTINCT FROM p_expected_target
    OR intent.user_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'upload_not_found'; END IF;
  SELECT * INTO v_auth FROM public.academic_upload_authorizations WHERE intent_id=p_intent FOR UPDATE;
  IF NOT FOUND OR v_auth.target_id IS DISTINCT FROM p_expected_target
    OR v_auth.user_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'upload_not_found'; END IF;
  -- 만료·마감·종료·이미 취소한 의도도 미소비 상태면 종료할 수 있다. 실물은 삭제하지 않는다.
  IF intent.state='CONSUMED'
    OR EXISTS(SELECT 1 FROM public.assignment_submissions WHERE upload_intent_id=p_intent)
    OR EXISTS(SELECT 1 FROM public.assignment_submission_files WHERE storage_key=intent.storage_key)
    THEN RAISE EXCEPTION 'upload_conflict'; END IF;
  UPDATE public.academic_upload_authorizations SET retired_at=coalesce(retired_at,clock_timestamp()) WHERE intent_id=p_intent;
END;
$cancel$;

-- 소비와 정리는 동일한 대상/의도 잠금으로 직렬화한다. 취소된 VERIFIED도 최종화할 수 없다.
CREATE OR REPLACE FUNCTION public.guard_authorized_academic_submission() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $final$
DECLARE v_auth public.academic_upload_authorizations;
BEGIN
  PERFORM 1 FROM public.assignment_targets WHERE id=NEW.assignment_target_id FOR UPDATE;
  PERFORM 1 FROM public.assignment_upload_intents WHERE id=NEW.upload_intent_id FOR UPDATE;
  SELECT * INTO v_auth FROM public.academic_upload_authorizations WHERE intent_id=NEW.upload_intent_id FOR UPDATE;
  -- #148 자체 시험/이전 의도는 기존 제약이 보호한다. #151 발급 의도에는 추가 상태를 강제한다.
  IF FOUND AND (v_auth.retired_at IS NOT NULL OR v_auth.cleanup_claimed_at IS NOT NULL
    OR v_auth.verified_etag IS NULL OR v_auth.target_id<>NEW.assignment_target_id
    OR v_auth.user_id<>NEW.submitted_by_user_id) THEN RAISE EXCEPTION 'upload_conflict'; END IF;
  RETURN NEW;
END;
$final$;
DROP TRIGGER IF EXISTS academic_upload_authorization_final_guard ON public.assignment_submissions;
CREATE TRIGGER academic_upload_authorization_final_guard BEFORE INSERT ON public.assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.guard_authorized_academic_submission();

-- 토큰 만료 뒤 5분 유예 후에만 삭제 권한을 선점한다. 최종 제출 참조는 두 경로로 확인한다.
CREATE OR REPLACE FUNCTION public.claim_academic_upload_cleanup(p_intent uuid)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,public AS $cleanup$
DECLARE intent public.assignment_upload_intents; target uuid; v_auth public.academic_upload_authorizations;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'upload_conflict'; END IF;
  SELECT assignment_target_id INTO target FROM public.assignment_upload_intents WHERE id=p_intent;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.assignment_targets WHERE id=target FOR UPDATE;
  SELECT * INTO intent FROM public.assignment_upload_intents WHERE id=p_intent FOR UPDATE;
  SELECT * INTO v_auth FROM public.academic_upload_authorizations WHERE intent_id=p_intent FOR UPDATE;
  IF NOT FOUND OR intent.state='CONSUMED' OR intent.expires_at+interval '5 minutes'>clock_timestamp()
    OR EXISTS (SELECT 1 FROM public.assignment_submissions WHERE upload_intent_id=p_intent)
    OR EXISTS (SELECT 1 FROM public.assignment_submission_files WHERE storage_key=intent.storage_key) THEN RETURN false; END IF;
  UPDATE public.academic_upload_authorizations SET retired_at=coalesce(retired_at,clock_timestamp()),cleanup_claimed_at=clock_timestamp() WHERE intent_id=p_intent;
  IF intent.state='INTENDED' THEN UPDATE public.assignment_upload_intents SET state='EXPIRED' WHERE id=p_intent; END IF;
  RETURN true;
END;
$cleanup$;
REVOKE ALL ON FUNCTION public.issue_academic_assignment_upload(uuid,uuid,uuid,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authorize_academic_assignment_upload(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_authorized_academic_upload(uuid,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_academic_assignment_upload(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_academic_upload_cleanup(uuid) FROM PUBLIC;
COMMIT;
