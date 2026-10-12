-- #91: 질문 삭제와 답변 제출의 경합에서도 답변을 보존합니다.
-- 사용: 대상 DB를 명시한 psql -v ON_ERROR_STOP=1 -f scripts/migrate-protect-application-answers.sql
-- 트랜잭션으로 기존 제약 제거와 새 제약 추가를 묶습니다. 데이터는 삭제하지 않습니다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE public.application_questions, public.application_answers IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  fk record;
  question_column smallint;
BEGIN
  SELECT attnum INTO STRICT question_column
  FROM pg_attribute
  WHERE attrelid = 'public.application_answers'::regclass
    AND attname = 'question_id' AND NOT attisdropped;

  -- 이름이 다른 기존 FK도 찾아 교체합니다. 예상 밖의 복합 FK는 자동 변경하지 않습니다.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.application_answers'::regclass
      AND contype = 'f' AND question_column = ANY(conkey)
      AND (conkey <> ARRAY[question_column]::smallint[]
        OR confrelid <> 'public.application_questions'::regclass)
  ) THEN
    RAISE EXCEPTION '예상하지 못한 question_id 외래키가 있습니다. 수동 검토가 필요합니다.';
  END IF;

  FOR fk IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.application_answers'::regclass
      AND contype = 'f' AND conkey = ARRAY[question_column]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE public.application_answers DROP CONSTRAINT %I', fk.conname);
  END LOOP;

  ALTER TABLE public.application_answers
    ADD CONSTRAINT application_answers_question_id_application_questions_id_fk
    FOREIGN KEY (question_id) REFERENCES public.application_questions(id)
    ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
END $$;
COMMIT;
