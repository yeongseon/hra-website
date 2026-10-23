-- #280 소유 로컬 fresh 후보: 운영 적용·실제 과거 적용 이력이 아닙니다.
-- 원본 참조: scripts/migrate-academic-submission-file-reads.sql
-- 검토 원본 SHA256: 44debf100ca98a103502f93b71c18213f3dfba8184b8ae5b0c6eafd922723e46
-- reviewedDelta: 3행 BEGIN; → 제외; 6행 SET LOCAL statement_timeout = '60s'; → 제외; 83행 COMMIT; → 제외
-- 원본→후보 보존 행: 1-2→11-12; 4-5→13-14; 7-82→15-90
-- 사유: 파일 transaction은 S2가 소유하며 설치 statement timeout은 더 강한 engine 한도를 적용합니다.
-- 보존: 내부 BEGIN/END·search_path·advisory lock·함수 본문/proconfig·ACL·FK/trigger·임시 expected 객체.
-- namespaceDelta: 없음. app DDL은 기존 public 명시, TEMP/INDEX는 PostgreSQL의 원래 namespace 규칙을 보존합니다.
-- 상태: S2 기본 timeoutMs=10000의 statement=7500ms/lock=5000ms/idle=10000ms 전제이며 전체 prefix 대조는 별도입니다.

-- #153 개인 제출 파일 전달 허가의 최소 감사만 추가합니다. #144→#147→#148 적용 후 실행합니다.
-- 보존·파기 정책이 정해지기 전 기존 파일이나 감사 행은 수정·삭제하지 않습니다.
SET LOCAL search_path = public, pg_catalog;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtextextended('hra:academic-submission-file-reads:v1', 0));

CREATE TABLE IF NOT EXISTS public.academic_submission_file_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL CONSTRAINT academic_submission_file_reads_actor_fk
    REFERENCES public.users(id) ON DELETE RESTRICT,
  submission_id uuid NOT NULL CONSTRAINT academic_submission_file_reads_submission_fk
    REFERENCES public.assignment_submissions(id) ON DELETE RESTRICT,
  file_id uuid NOT NULL CONSTRAINT academic_submission_file_reads_file_fk
    REFERENCES public.assignment_submission_files(id) ON DELETE RESTRICT,
  access_scope text NOT NULL CONSTRAINT academic_submission_file_reads_scope_check
    CHECK (access_scope IN ('OWNER', 'MANAGEMENT')),
  authorized_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS academic_submission_file_reads_actor_time_idx
  ON public.academic_submission_file_reads(actor_user_id, authorized_at);
CREATE INDEX IF NOT EXISTS academic_submission_file_reads_file_time_idx
  ON public.academic_submission_file_reads(file_id, authorized_at);

-- IF NOT EXISTS만으로 기존 구조의 일치를 보장할 수 없어 카탈로그를 대조합니다.
DO $shape$
DECLARE actual jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid='public.academic_submission_file_reads'::regclass
    AND (relkind<>'r' OR relrowsecurity OR relforcerowsecurity)) THEN
    RAISE EXCEPTION 'academic_file_read_schema_mismatch';
  END IF;
  SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
    COALESCE(pg_get_expr(d.adbin,d.adrelid),'')) ORDER BY a.attnum) INTO actual
  FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid='public.academic_submission_file_reads'::regclass AND a.attnum>0 AND NOT a.attisdropped;
  IF actual IS DISTINCT FROM '[
    ["id","uuid",true,"gen_random_uuid()"],["actor_user_id","uuid",true,""],
    ["submission_id","uuid",true,""],["file_id","uuid",true,""],
    ["access_scope","text",true,""],["authorized_at","timestamp with time zone",true,"clock_timestamp()"]]'::jsonb
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.academic_submission_file_reads'::regclass AND contype<>'n')<>5
    OR (SELECT count(*) FROM pg_index WHERE indrelid='public.academic_submission_file_reads'::regclass)<>3 THEN
    RAISE EXCEPTION 'academic_file_read_schema_mismatch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('p', 'PRIMARY KEY (id)'),
      ('f', 'FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT'),
      ('f', 'FOREIGN KEY (submission_id) REFERENCES assignment_submissions(id) ON DELETE RESTRICT'),
      ('f', 'FOREIGN KEY (file_id) REFERENCES assignment_submission_files(id) ON DELETE RESTRICT'),
      ('c', 'CHECK ((access_scope = ANY (ARRAY[''OWNER''::text, ''MANAGEMENT''::text])))')
    ) expected(kind, definition)
    WHERE NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.academic_submission_file_reads'::regclass
      AND c.contype::text=expected.kind AND pg_get_constraintdef(c.oid)=expected.definition
      AND c.convalidated AND NOT c.condeferrable)
  ) THEN RAISE EXCEPTION 'academic_file_read_constraint_mismatch'; END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('academic_submission_file_reads_actor_time_idx', 'CREATE INDEX academic_submission_file_reads_actor_time_idx ON public.academic_submission_file_reads USING btree (actor_user_id, authorized_at)'),
      ('academic_submission_file_reads_file_time_idx', 'CREATE INDEX academic_submission_file_reads_file_time_idx ON public.academic_submission_file_reads USING btree (file_id, authorized_at)')
    ) expected(name, definition)
    WHERE NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid=to_regclass('public.'||expected.name)
      AND i.indrelid='public.academic_submission_file_reads'::regclass AND i.indisvalid AND i.indisready
      AND pg_get_indexdef(i.indexrelid)=expected.definition)
  ) THEN RAISE EXCEPTION 'academic_file_read_index_mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.academic_submission_file_reads'::regclass
    AND NOT tgisinternal AND (tgname<>'academic_submission_file_reads_immutable' OR tgenabled<>'O')) THEN
    RAISE EXCEPTION 'academic_file_read_trigger_mismatch';
  END IF;
END;
$shape$;

CREATE OR REPLACE FUNCTION public.guard_academic_submission_file_read() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $immutable$
BEGIN RAISE EXCEPTION 'academic_file_read_immutable'; END;
$immutable$;
DROP TRIGGER IF EXISTS academic_submission_file_reads_immutable ON public.academic_submission_file_reads;
CREATE TRIGGER academic_submission_file_reads_immutable BEFORE UPDATE OR DELETE ON public.academic_submission_file_reads
  FOR EACH ROW EXECUTE FUNCTION public.guard_academic_submission_file_read();
COMMENT ON TABLE public.academic_submission_file_reads IS
  '파일 전달 허가 감사. 네트워크 수신 완료 증명이 아니며 파일명·저장 키·URL·본문을 저장하지 않는다.';
