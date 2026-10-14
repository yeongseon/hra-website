-- #193: 기수·양식의 일반 삭제가 지원자 제출 데이터를 연쇄 삭제하지 못하도록 합니다.
-- 사용: 대상 DB를 명시한 psql -v ON_ERROR_STOP=1 -f scripts/migrate-protect-application-submissions.sql
-- 현재 CASCADE 또는 이미 적용된 RESTRICT만 허용합니다. 예상 외 제약은 자동 변경하지 않습니다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  submission_action char;
  legacy_action char;
BEGIN
  SELECT confdeltype INTO submission_action FROM pg_constraint
  WHERE conrelid = 'public.application_submissions'::regclass
    AND conname = 'application_submissions_form_id_application_forms_id_fk'
    AND confrelid = 'public.application_forms'::regclass;
  SELECT confdeltype INTO legacy_action FROM pg_constraint
  WHERE conrelid = 'public.applications'::regclass
    AND conname = 'applications_cohort_id_cohorts_id_fk'
    AND confrelid = 'public.cohorts'::regclass;

  IF submission_action IS NULL OR submission_action NOT IN ('c', 'r') OR
     legacy_action IS NULL OR legacy_action NOT IN ('c', 'r') THEN
    RAISE EXCEPTION '지원서 외래키가 예상과 다릅니다. 수동 검토가 필요합니다.';
  END IF;

  IF submission_action = 'c' THEN
    ALTER TABLE public.application_submissions
      DROP CONSTRAINT application_submissions_form_id_application_forms_id_fk;
    ALTER TABLE public.application_submissions
      ADD CONSTRAINT application_submissions_form_id_application_forms_id_fk
      FOREIGN KEY (form_id) REFERENCES public.application_forms(id)
      ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;

  IF legacy_action = 'c' THEN
    ALTER TABLE public.applications
      DROP CONSTRAINT applications_cohort_id_cohorts_id_fk;
    ALTER TABLE public.applications
      ADD CONSTRAINT applications_cohort_id_cohorts_id_fk
      FOREIGN KEY (cohort_id) REFERENCES public.cohorts(id)
      ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;
END $$;
COMMIT;
