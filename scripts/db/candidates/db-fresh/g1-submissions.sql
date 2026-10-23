-- #280 소유 로컬 fresh 후보: 운영 적용·실제 과거 적용 이력이 아닙니다.
-- 원본 참조: scripts/migrate-academic-submissions.sql
-- 검토 원본 SHA256: 8171ee9346ba02bdc887cf9b9703ae643fe2f10935808719aca47a6c4fc0fad3
-- reviewedDelta: 3행 BEGIN; → 제외; 6행 SET LOCAL statement_timeout = '60s'; → 제외; 360행 COMMIT; → 제외
-- 원본→후보 보존 행: 1-2→11-12; 4-5→13-14; 7-359→15-367
-- 사유: 파일 transaction은 S2가 소유하며 설치 statement timeout은 더 강한 engine 한도를 적용합니다.
-- 보존: 내부 BEGIN/END·search_path·advisory lock·함수 본문/proconfig·ACL·FK/trigger·임시 expected 객체.
-- namespaceDelta: 없음. app DDL은 기존 public 명시, TEMP/INDEX는 PostgreSQL의 원래 namespace 규칙을 보존합니다.
-- 상태: S2 기본 timeoutMs=10000의 statement=7500ms/lock=5000ms/idle=10000ms 전제이며 전체 prefix 대조는 별도입니다.

-- #148 최종 제출·단일 파일·검증된 업로드 의도. #144와 #147이 선행한다.
-- 보존기간(#142) 확정 전 운영 활성화와 자동삭제를 수행하지 않는다.
SET LOCAL search_path = public, pg_catalog;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtextextended('hra:academic-submissions:v1', 0));
DO $enum$
BEGIN
  IF to_regtype('public.assignment_upload_state') IS NULL THEN
    CREATE TYPE public.assignment_upload_state AS ENUM ('INTENDED', 'VERIFIED', 'CONSUMED', 'EXPIRED');
  END IF;
  IF (SELECT array_agg(enumlabel::text ORDER BY enumsortorder) FROM pg_enum
    WHERE enumtypid='public.assignment_upload_state'::regtype)
    IS DISTINCT FROM ARRAY['INTENDED','VERIFIED','CONSUMED','EXPIRED']::text[] THEN
    RAISE EXCEPTION '업로드 상태 enum 불일치: 별도 forward-fix가 필요합니다.';
  END IF;
END;
$enum$;

-- 같은 정의로 트랜잭션 범위의 비교 스키마·테이블을 생성하여 기존 컬럼·기본값·제약의 드리프트를 감지한다.
-- 동명 스키마가 이미 있으면 실패하며 비교 뒤 명시적으로 삭제한다. 운영 자료를 복사하지 않는다.
CREATE SCHEMA hra_submission_expected;
DO $tables$
DECLARE definition text;
BEGIN
  FOREACH definition IN ARRAY ARRAY[
$ddl$CREATE TABLE public.assignment_upload_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_target_id uuid NOT NULL CONSTRAINT assignment_upload_intents_target_fk REFERENCES public.assignment_targets(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL CONSTRAINT assignment_upload_intents_user_id_users_id_fk REFERENCES public.users(id) ON DELETE RESTRICT,
  storage_key varchar(1024) NOT NULL,
  state public.assignment_upload_state NOT NULL DEFAULT 'INTENDED',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  original_name varchar(255),
  mime_type varchar(100),
  size_bytes integer,
  checksum varchar(64),
  CONSTRAINT assignment_upload_intents_storage_key_unique UNIQUE (storage_key),
  CONSTRAINT assignment_upload_intents_identity_unique UNIQUE (id,assignment_target_id,user_id),
  CONSTRAINT assignment_upload_intents_key_shape CHECK (length(btrim(storage_key))>0 AND storage_key !~ '(^/|://|(^|/)\.\.(/|$)|[[:cntrl:]])'),
  CONSTRAINT assignment_upload_intents_expiry_shape CHECK (isfinite(created_at) AND isfinite(expires_at) AND expires_at>created_at),
  CONSTRAINT assignment_upload_intents_verification_shape CHECK (
    (state IN ('INTENDED','EXPIRED') AND verified_at IS NULL AND original_name IS NULL AND mime_type IS NULL AND size_bytes IS NULL AND checksum IS NULL) OR
    (state IN ('VERIFIED','CONSUMED') AND verified_at IS NOT NULL AND isfinite(verified_at) AND verified_at>=created_at AND verified_at<expires_at
      AND original_name IS NOT NULL AND length(btrim(original_name))>0 AND original_name !~ '[/\\[:cntrl:]]'
      AND mime_type IS NOT NULL AND mime_type='application/pdf' AND size_bytes IS NOT NULL AND size_bytes BETWEEN 1 AND 52428800
      AND checksum IS NOT NULL AND checksum ~ '^[0-9a-f]{64}$'))
)$ddl$,
$ddl$CREATE TABLE public.assignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_target_id uuid NOT NULL CONSTRAINT assignment_submissions_target_fk REFERENCES public.assignment_targets(id) ON DELETE RESTRICT,
  submitted_by_user_id uuid NOT NULL CONSTRAINT assignment_submissions_submitted_by_user_id_users_id_fk REFERENCES public.users(id) ON DELETE RESTRICT,
  upload_intent_id uuid NOT NULL,
  submission_key uuid NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignment_submissions_target_unique UNIQUE (assignment_target_id),
  CONSTRAINT assignment_submissions_key_unique UNIQUE (submission_key),
  CONSTRAINT assignment_submissions_intent_unique UNIQUE (upload_intent_id),
  CONSTRAINT assignment_submissions_intent_identity_fk FOREIGN KEY (upload_intent_id,assignment_target_id,submitted_by_user_id)
    REFERENCES public.assignment_upload_intents(id,assignment_target_id,user_id) ON DELETE RESTRICT,
  CONSTRAINT assignment_submissions_time_finite CHECK (isfinite(submitted_at))
)$ddl$,
$ddl$CREATE TABLE public.assignment_submission_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL CONSTRAINT assignment_submission_files_submission_fk REFERENCES public.assignment_submissions(id) ON DELETE RESTRICT,
  storage_key varchar(1024) NOT NULL,
  original_name varchar(255) NOT NULL,
  mime_type varchar(100) NOT NULL,
  size_bytes integer NOT NULL,
  checksum varchar(64) NOT NULL,
  CONSTRAINT assignment_submission_files_submission_unique UNIQUE (submission_id),
  CONSTRAINT assignment_submission_files_storage_key_unique UNIQUE (storage_key),
  CONSTRAINT assignment_submission_files_metadata_shape CHECK (
    length(btrim(storage_key))>0 AND storage_key !~ '(^/|://|(^|/)\.\.(/|$)|[[:cntrl:]])'
    AND length(btrim(original_name))>0 AND original_name !~ '[/\\[:cntrl:]]'
    AND mime_type='application/pdf' AND size_bytes BETWEEN 1 AND 52428800 AND checksum ~ '^[0-9a-f]{64}$')
)$ddl$
  ] LOOP
    EXECUTE replace(definition,'CREATE TABLE public.','CREATE TABLE IF NOT EXISTS public.');
    EXECUTE replace(definition,'CREATE TABLE public.','CREATE TABLE hra_submission_expected.');
  END LOOP;
END;
$tables$;
CREATE INDEX IF NOT EXISTS assignment_upload_intents_target_user_idx ON public.assignment_upload_intents(assignment_target_id,user_id);
CREATE INDEX IF NOT EXISTS assignment_upload_intents_state_expiry_idx ON public.assignment_upload_intents(state,expires_at);
CREATE INDEX IF NOT EXISTS assignment_submissions_user_time_idx ON public.assignment_submissions(submitted_by_user_id,submitted_at);
CREATE INDEX expected_intents_target_user_idx ON hra_submission_expected.assignment_upload_intents(assignment_target_id,user_id);
CREATE INDEX expected_intents_state_expiry_idx ON hra_submission_expected.assignment_upload_intents(state,expires_at);
CREATE INDEX expected_submissions_user_time_idx ON hra_submission_expected.assignment_submissions(submitted_by_user_id,submitted_at);

DO $shape$
DECLARE table_name text; actual_oid oid; expected_oid oid; actual_shape jsonb; expected_shape jsonb;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['assignment_upload_intents','assignment_submissions','assignment_submission_files'] LOOP
    actual_oid=to_regclass('public.'||table_name);
    expected_oid=to_regclass('hra_submission_expected.'||table_name);
    IF EXISTS (SELECT 1 FROM pg_class WHERE oid=actual_oid AND (relkind<>'r' OR relrowsecurity OR relforcerowsecurity)) THEN
      RAISE EXCEPTION '제출 테이블 종류 또는 RLS 불일치: %',table_name;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=actual_oid AND NOT tgisinternal
      AND (tgenabled<>'O' OR tgname NOT IN (
        'academic_upload_intent_guard','academic_final_submission_guard','academic_final_file_guard',
        'academic_submission_complete','academic_submission_file_complete','academic_upload_consumed_complete'))) THEN
      RAISE EXCEPTION '제출 사용자 트리거 불일치: %',table_name;
    END IF;
    -- 컬럼 순서·기본값·제약 정의·FK 삭제 규칙·인덱스의 키와 조건까지 비교한다.
    SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
      pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) INTO actual_shape
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=actual_oid AND a.attnum>0 AND NOT a.attisdropped;
    SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
      pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) INTO expected_shape
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=expected_oid AND a.attnum>0 AND NOT a.attisdropped;
    IF actual_shape IS DISTINCT FROM expected_shape THEN RAISE EXCEPTION '제출 컬럼·기본값 불일치: %',table_name; END IF;
    SELECT jsonb_agg(jsonb_build_array(contype,convalidated,condeferrable,condeferred,pg_get_constraintdef(oid)) ORDER BY pg_get_constraintdef(oid)) INTO actual_shape
      FROM pg_constraint WHERE conrelid=actual_oid AND contype NOT IN ('n','t');
    SELECT jsonb_agg(jsonb_build_array(contype,convalidated,condeferrable,condeferred,pg_get_constraintdef(oid)) ORDER BY pg_get_constraintdef(oid)) INTO expected_shape
      FROM pg_constraint WHERE conrelid=expected_oid AND contype NOT IN ('n','t');
    IF actual_shape IS DISTINCT FROM expected_shape THEN RAISE EXCEPTION '제출 제약 불일치: %',table_name; END IF;
    SELECT jsonb_agg(jsonb_build_array(i.indisunique,i.indisprimary,i.indisvalid,i.indisready,i.indkey::text,
      i.indclass::text,i.indcollation::text,i.indoption::text,pg_get_expr(i.indexprs,i.indrelid),pg_get_expr(i.indpred,i.indrelid)) ORDER BY i.indkey::text,i.indisunique,i.indisprimary) INTO actual_shape
      FROM pg_index i WHERE i.indrelid=actual_oid;
    SELECT jsonb_agg(jsonb_build_array(i.indisunique,i.indisprimary,i.indisvalid,i.indisready,i.indkey::text,
      i.indclass::text,i.indcollation::text,i.indoption::text,pg_get_expr(i.indexprs,i.indrelid),pg_get_expr(i.indpred,i.indrelid)) ORDER BY i.indkey::text,i.indisunique,i.indisprimary) INTO expected_shape
      FROM pg_index i WHERE i.indrelid=expected_oid;
    IF actual_shape IS DISTINCT FROM expected_shape THEN RAISE EXCEPTION '제출 인덱스 불일치: %',table_name; END IF;
  END LOOP;
END;
$shape$;
DROP SCHEMA hra_submission_expected CASCADE;

-- 호출자 인가는 서버에서 확인한다. DB는 학생-학적-대상-계정 및 공개·마감을 재검증한다.
CREATE OR REPLACE FUNCTION public.assert_academic_submission_owner(target_id uuid,actor_id uuid,check_deadline boolean)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $owner$
DECLARE bound_user uuid; actor_role text; definition public.assignments;
BEGIN
  -- 다른 트랜잭션이 새로 만든 업로드·제출을 오래된 고정 snapshot으로 놓치지 않게 한다.
  -- 함수는 VOLATILE(기본값)이므로 READ COMMITTED에서 각 내부 쿼리가 최신 snapshot을 사용한다.
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION '업로드·최종 제출 소유권 검증은 READ COMMITTED 격리수준에서 실행해야 합니다.';
  END IF;
  -- 역할 철회와 학적 철회는 같은 트랜잭션이 끝날 때까지 SHARE 잠금으로 직렬화한다.
  -- 대상 잠금 뒤에는 항상 계정 → 학생/학적 → 과제 → 업로드 의도 순서로 잠근다.
  SELECT u.role::text INTO actor_role FROM public.users u WHERE u.id=actor_id FOR SHARE;
  IF NOT FOUND OR actor_role IS DISTINCT FROM 'MEMBER' THEN
    RAISE EXCEPTION '현재 학생 회원 계정만 제출할 수 있습니다.';
  END IF;
  SELECT s.user_id INTO bound_user FROM public.assignment_targets t
    JOIN public.cohort_enrollments e ON e.id=t.enrollment_id JOIN public.academic_students s ON s.id=e.student_id
    WHERE t.id=target_id AND e.status='ENROLLED' AND e.ended_at IS NULL
      AND e.enrolled_at<=clock_timestamp() AND e.created_at<=clock_timestamp()
    FOR SHARE OF s,e;
  IF NOT FOUND OR bound_user IS NULL OR bound_user IS DISTINCT FROM actor_id THEN
    RAISE EXCEPTION '유효한 등록 학적에 연결된 본인 계정만 제출할 수 있습니다.';
  END IF;
  SELECT a.* INTO definition FROM public.assignments a JOIN public.assignment_targets t ON t.assignment_id=a.id
    WHERE t.id=target_id FOR SHARE OF a;
  IF NOT FOUND OR definition.status NOT IN ('PUBLISHED','CLOSED') OR definition.published_at IS NULL
    OR definition.published_at>clock_timestamp() THEN
    RAISE EXCEPTION '공개된 본인 과제에만 접근할 수 있습니다.';
  END IF;
  IF check_deadline AND (definition.status<>'PUBLISHED' OR definition.due_at IS NULL OR clock_timestamp()>=definition.due_at) THEN
    RAISE EXCEPTION '공개되어 마감 전인 과제에만 제출할 수 있습니다.';
  END IF;
END;
$owner$;

-- 불변 키와 검증 메타를 보호한다. 검증 시각은 DB 시각으로 확정하며 클라이언트 시각을 신뢰하지 않는다.
CREATE OR REPLACE FUNCTION public.guard_academic_upload_intent() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $intent$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.state='CONSUMED' THEN RAISE EXCEPTION '최종 제출에 사용한 업로드 의도는 삭제할 수 없습니다.'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'INTENDED' THEN RAISE EXCEPTION '업로드 의도는 미검증 상태로 생성해야 합니다.'; END IF;
    NEW.created_at=clock_timestamp();
    PERFORM 1 FROM public.assignment_targets WHERE id=NEW.assignment_target_id FOR UPDATE;
    PERFORM public.assert_academic_submission_owner(NEW.assignment_target_id,NEW.user_id,true);
  ELSE
    IF ROW(NEW.id,NEW.assignment_target_id,NEW.user_id,NEW.storage_key,NEW.expires_at,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.assignment_target_id,OLD.user_id,OLD.storage_key,OLD.expires_at,OLD.created_at) THEN
      RAISE EXCEPTION '업로드 의도의 식별자·소유자·저장경로·유효기간은 불변입니다.';
    END IF;
    IF OLD.state='INTENDED' AND NEW.state='VERIFIED' THEN
      PERFORM public.assert_academic_submission_owner(NEW.assignment_target_id,NEW.user_id,true);
      NEW.verified_at=clock_timestamp();
      IF NEW.verified_at>=NEW.expires_at THEN RAISE EXCEPTION '만료된 업로드 의도입니다.'; END IF;
    ELSIF OLD.state='VERIFIED' AND NEW.state='CONSUMED' THEN
      IF (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state') THEN
        RAISE EXCEPTION '소비 시 업로드 검증 메타를 변경할 수 없습니다.';
      END IF;
    ELSIF OLD.state='INTENDED' AND NEW.state='EXPIRED' AND clock_timestamp()>=OLD.expires_at THEN
      NULL;
    ELSE RAISE EXCEPTION '허용되지 않는 업로드 상태 전이입니다.';
    END IF;
  END IF;
  RETURN NEW;
END;
$intent$;

CREATE OR REPLACE FUNCTION public.guard_academic_final_submission() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $final$
DECLARE intent public.assignment_upload_intents;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION '최종 제출과 파일은 변경·삭제할 수 없습니다.'; END IF;
  IF TG_TABLE_NAME='assignment_submissions' THEN
    PERFORM 1 FROM public.assignment_targets WHERE id=NEW.assignment_target_id FOR UPDATE;
    PERFORM public.assert_academic_submission_owner(NEW.assignment_target_id,NEW.submitted_by_user_id,true);
    SELECT * INTO intent FROM public.assignment_upload_intents WHERE id=NEW.upload_intent_id FOR UPDATE;
    IF NOT FOUND OR intent.state<>'VERIFIED' OR intent.expires_at<=clock_timestamp()
      OR intent.assignment_target_id IS DISTINCT FROM NEW.assignment_target_id OR intent.user_id IS DISTINCT FROM NEW.submitted_by_user_id THEN
      RAISE EXCEPTION '본인 대상의 유효한 서버 검증 업로드가 필요합니다.';
    END IF;
    NEW.submitted_at=clock_timestamp();
    -- 제출 시각을 확정한 뒤 마감과 다시 비교하여 경계 통과를 차단한다.
    IF NEW.submitted_at>=(SELECT a.due_at FROM public.assignments a JOIN public.assignment_targets t ON t.assignment_id=a.id WHERE t.id=NEW.assignment_target_id) THEN
      RAISE EXCEPTION '과제 마감 시각이 지났습니다.';
    END IF;
  END IF;
  RETURN NEW;
END;
$final$;

-- 제출·파일·소비 상태는 같은 트랜잭션에서 완성되어야 한다. 지연 검사는 COMMIT과 SET CONSTRAINTS에서 실행된다.
CREATE OR REPLACE FUNCTION public.assert_academic_submission_complete() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $complete$
DECLARE final_id uuid;
BEGIN
  IF TG_TABLE_NAME='assignment_upload_intents' THEN
    IF NEW.state<>'CONSUMED' THEN RETURN NEW; END IF;
    SELECT id INTO final_id FROM public.assignment_submissions WHERE upload_intent_id=NEW.id;
    IF final_id IS NULL THEN RAISE EXCEPTION '소비된 업로드 의도에는 최종 제출이 필요합니다.'; END IF;
  ELSIF TG_TABLE_NAME='assignment_submission_files' THEN final_id=NEW.submission_id;
  ELSE final_id=NEW.id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.assignment_submissions s
    JOIN public.assignment_submission_files f ON f.submission_id=s.id
    JOIN public.assignment_upload_intents i ON i.id=s.upload_intent_id
    WHERE s.id=final_id AND i.state='CONSUMED'
      AND ROW(f.storage_key,f.original_name,f.mime_type,f.size_bytes,f.checksum)
        IS NOT DISTINCT FROM ROW(i.storage_key,i.original_name,i.mime_type,i.size_bytes,i.checksum)) THEN
    RAISE EXCEPTION '최종 제출·검증된 단일 파일·소비된 업로드 의도를 함께 저장해야 합니다.';
  END IF;
  RETURN NEW;
END;
$complete$;

-- 제출 기록의 소유자가 이후 다른 계정으로 조용히 바뀌는 것을 방지한다.
CREATE OR REPLACE FUNCTION public.guard_academic_submission_binding() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $binding$
BEGIN
  -- 참조 유무를 먼저 조회하면 REPEATABLE READ의 오래된 snapshot이 신규 이력을 누락할 수 있다.
  -- 따라서 계정 연결이 바뀌는 모든 요청에서 조회 전에 격리수준을 검사한다.
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
    AND current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION '학생 계정 연결 변경은 READ COMMITTED 격리수준에서 실행해야 합니다.';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id AND EXISTS (
    SELECT 1 FROM public.cohort_enrollments e JOIN public.assignment_targets t ON t.enrollment_id=e.id
      JOIN public.assignment_upload_intents i ON i.assignment_target_id=t.id
      WHERE e.student_id=OLD.id AND i.user_id IS DISTINCT FROM NEW.user_id) THEN
    RAISE EXCEPTION '업로드·제출 이력이 있는 학생의 계정 연결은 별도 이관 절차가 필요합니다.';
  END IF;
  RETURN NEW;
END;
$binding$;

DROP TRIGGER IF EXISTS academic_upload_intent_guard ON public.assignment_upload_intents;
CREATE TRIGGER academic_upload_intent_guard BEFORE INSERT OR UPDATE OR DELETE ON public.assignment_upload_intents FOR EACH ROW EXECUTE FUNCTION public.guard_academic_upload_intent();
DROP TRIGGER IF EXISTS academic_final_submission_guard ON public.assignment_submissions;
CREATE TRIGGER academic_final_submission_guard BEFORE INSERT OR UPDATE OR DELETE ON public.assignment_submissions FOR EACH ROW EXECUTE FUNCTION public.guard_academic_final_submission();
DROP TRIGGER IF EXISTS academic_final_file_guard ON public.assignment_submission_files;
CREATE TRIGGER academic_final_file_guard BEFORE INSERT OR UPDATE OR DELETE ON public.assignment_submission_files FOR EACH ROW EXECUTE FUNCTION public.guard_academic_final_submission();
DROP TRIGGER IF EXISTS academic_submission_complete ON public.assignment_submissions;
CREATE CONSTRAINT TRIGGER academic_submission_complete AFTER INSERT ON public.assignment_submissions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.assert_academic_submission_complete();
DROP TRIGGER IF EXISTS academic_submission_file_complete ON public.assignment_submission_files;
CREATE CONSTRAINT TRIGGER academic_submission_file_complete AFTER INSERT ON public.assignment_submission_files DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.assert_academic_submission_complete();
DROP TRIGGER IF EXISTS academic_upload_consumed_complete ON public.assignment_upload_intents;
CREATE CONSTRAINT TRIGGER academic_upload_consumed_complete AFTER UPDATE ON public.assignment_upload_intents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.assert_academic_submission_complete();
DROP TRIGGER IF EXISTS academic_submission_binding_guard ON public.academic_students;
CREATE TRIGGER academic_submission_binding_guard BEFORE UPDATE ON public.academic_students FOR EACH ROW EXECUTE FUNCTION public.guard_academic_submission_binding();

-- 서버는 비공개 Blob HEAD/내용·소유권 검증 후 이 함수를 호출한다. DB 함수 자체는 외부 Blob 검증을 대신하지 않는다.
CREATE OR REPLACE FUNCTION public.verify_academic_assignment_upload(intent_id uuid,actor_id uuid,file_name text,file_mime text,file_size integer,file_checksum text)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,public AS $verify$
DECLARE intent public.assignment_upload_intents;
BEGIN
  -- 경로는 불변이므로 먼저 읽어 대상 잠금 순서를 정하고, 의도 잠금 뒤 상태를 다시 검사한다.
  SELECT * INTO intent FROM public.assignment_upload_intents WHERE id=intent_id;
  IF NOT FOUND OR intent.user_id IS DISTINCT FROM actor_id THEN
    RAISE EXCEPTION '검증할 본인 업로드 의도가 없습니다.';
  END IF;
  PERFORM 1 FROM public.assignment_targets WHERE id=intent.assignment_target_id FOR UPDATE;
  PERFORM public.assert_academic_submission_owner(intent.assignment_target_id,actor_id,true);
  SELECT * INTO intent FROM public.assignment_upload_intents WHERE id=intent_id FOR UPDATE;
  IF NOT FOUND OR intent.user_id IS DISTINCT FROM actor_id OR intent.state<>'INTENDED' THEN
    RAISE EXCEPTION '검증할 본인 업로드 의도가 없습니다.';
  END IF;
  UPDATE public.assignment_upload_intents SET state='VERIFIED',original_name=file_name,mime_type=file_mime,size_bytes=file_size,checksum=file_checksum WHERE id=intent_id;
  RETURN intent_id;
END;
$verify$;

-- 대상 행 잠금으로 같은 학생의 경쟁 최종화를 직렬화한다. 동일 키 재시도는 마감 후에도 기존 결과를 돌려준다.
CREATE OR REPLACE FUNCTION public.finalize_academic_assignment_submission(target_id uuid,actor_id uuid,intent_id uuid,request_key uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,public AS $submit$
DECLARE existing public.assignment_submissions; intent public.assignment_upload_intents; final_id uuid;
BEGIN
  IF target_id IS NULL OR actor_id IS NULL OR intent_id IS NULL OR request_key IS NULL THEN
    RAISE EXCEPTION '제출 대상·계정·업로드 의도·멱등 키가 필요합니다.';
  END IF;
  PERFORM 1 FROM public.assignment_targets WHERE id=target_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '과제 대상이 없습니다.'; END IF;
  PERFORM public.assert_academic_submission_owner(target_id,actor_id,false);
  SELECT * INTO existing FROM public.assignment_submissions WHERE submission_key=request_key;
  IF FOUND THEN
    IF existing.assignment_target_id IS DISTINCT FROM target_id OR existing.submitted_by_user_id IS DISTINCT FROM actor_id
      OR existing.upload_intent_id IS DISTINCT FROM intent_id THEN RAISE EXCEPTION '다른 제출에 사용된 멱등 키입니다.'; END IF;
    RETURN existing.id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.assignment_submissions WHERE assignment_target_id=target_id) THEN
    RAISE EXCEPTION '이미 최종 제출한 과제입니다.';
  END IF;
  SELECT * INTO intent FROM public.assignment_upload_intents WHERE id=intent_id FOR UPDATE;
  INSERT INTO public.assignment_submissions(assignment_target_id,submitted_by_user_id,upload_intent_id,submission_key)
    VALUES(target_id,actor_id,intent_id,request_key) RETURNING id INTO final_id;
  INSERT INTO public.assignment_submission_files(submission_id,storage_key,original_name,mime_type,size_bytes,checksum)
    VALUES(final_id,intent.storage_key,intent.original_name,intent.mime_type,intent.size_bytes,intent.checksum);
  UPDATE public.assignment_upload_intents SET state='CONSUMED' WHERE id=intent_id;
  RETURN final_id;
END;
$submit$;

-- 익명/일반 DB 역할에 검증·최종화 진입점을 자동 공개하지 않는다. 앱 역할의 명시적 GRANT는 운영 절차에서 수행한다.
REVOKE ALL ON FUNCTION public.assert_academic_submission_owner(uuid,uuid,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_academic_assignment_upload(uuid,uuid,text,text,integer,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_academic_assignment_submission(uuid,uuid,uuid,uuid) FROM PUBLIC;
-- 이미 존재하는 행도 트리거 설치 전에 동일한 계약을 만족해야 한다.
DO $data$
BEGIN
  IF EXISTS (SELECT 1 FROM public.assignment_submissions s LEFT JOIN public.assignment_submission_files f ON f.submission_id=s.id
    JOIN public.assignment_upload_intents i ON i.id=s.upload_intent_id
    WHERE f.id IS NULL OR i.state<>'CONSUMED' OR ROW(f.storage_key,f.original_name,f.mime_type,f.size_bytes,f.checksum)
      IS DISTINCT FROM ROW(i.storage_key,i.original_name,i.mime_type,i.size_bytes,i.checksum))
    OR EXISTS (SELECT 1 FROM public.assignment_upload_intents i WHERE i.state='CONSUMED'
      AND NOT EXISTS (SELECT 1 FROM public.assignment_submissions s WHERE s.upload_intent_id=i.id))
    OR EXISTS (SELECT 1 FROM public.assignment_upload_intents i JOIN public.assignment_targets t ON t.id=i.assignment_target_id
      JOIN public.cohort_enrollments e ON e.id=t.enrollment_id JOIN public.academic_students s ON s.id=e.student_id
      WHERE i.user_id IS DISTINCT FROM s.user_id) THEN
    RAISE EXCEPTION '기존 제출·파일·업로드 소유권 부정합: 별도 복구가 필요합니다.';
  END IF;
END;
$data$;
