-- 지원서 질문과 선택지를 단일 문장으로 저장한다 (#96).
-- 양식 행 잠금은 두 관리자의 저장을 직렬화하고, 버전 비교는 오래된 화면의 덮어쓰기를 거부한다.
-- 함수 호출 중 하나라도 실패하면 PostgreSQL이 질문·선택지·버전 변경을 모두 되돌린다.
CREATE OR REPLACE FUNCTION save_application_form_questions(
  p_form_id uuid,
  p_expected_revision integer,
  p_questions jsonb
)
RETURNS TABLE (revision integer, question_ids jsonb)
LANGUAGE plpgsql
AS $function$
DECLARE
  current_revision integer;
  incoming_ids uuid[];
  question_data jsonb;
  option_data jsonb;
  saved_question_id uuid;
  saved_ids jsonb := '[]'::jsonb;
  answered boolean;
  previous_title text;
  previous_description text;
  previous_type application_question_type;
  previous_options jsonb;
  requested_options jsonb;
BEGIN
  SELECT forms.questions_revision INTO current_revision
  FROM application_forms AS forms
  WHERE forms.id = p_form_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_form_questions_missing' USING ERRCODE = 'P0001';
  END IF;

  IF current_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'application_form_questions_stale' USING ERRCODE = 'P0001';
  END IF;

  -- 요청에 남은 질문만 보존한다. 답변이 달린 질문 삭제는 기존 FK가 커밋을 거부한다.
  SELECT ARRAY(
    SELECT (item->>'id')::uuid
    FROM jsonb_array_elements(p_questions) AS item
    WHERE item ? 'id' AND item->>'id' IS NOT NULL
  ) INTO incoming_ids;

  DELETE FROM application_questions AS questions
  WHERE questions.form_id = p_form_id
    AND questions.id <> ALL(incoming_ids);

  FOR question_data IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
    IF question_data ? 'id' AND question_data->>'id' IS NOT NULL THEN
      saved_question_id := (question_data->>'id')::uuid;
      -- 질문 행 잠금은 답변 INSERT의 FK 검사와 경합한다. 검사 후 새 답변이 끼어들지 못한다.
      SELECT questions.title, questions.description, questions.type
      INTO previous_title, previous_description, previous_type
      FROM application_questions AS questions
      WHERE questions.id = saved_question_id AND questions.form_id = p_form_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'application_form_questions_invalid_id' USING ERRCODE = 'P0001';
      END IF;

      SELECT EXISTS (
        SELECT 1 FROM application_answers AS answers
        WHERE answers.question_id = saved_question_id
      ) INTO answered;

      IF answered THEN
        -- 순서·필수 여부는 과거 답변의 의미를 바꾸지 않는다. 문구·유형·값은 정확히 보존한다.
        SELECT COALESCE(jsonb_agg(options.value ORDER BY options.value), '[]'::jsonb)
        INTO previous_options
        FROM application_question_options AS options
        WHERE options.question_id = saved_question_id;

        SELECT COALESCE(jsonb_agg(item->>'value' ORDER BY item->>'value'), '[]'::jsonb)
        INTO requested_options
        FROM jsonb_array_elements(COALESCE(question_data->'options', '[]'::jsonb)) AS item;

        IF previous_title IS DISTINCT FROM question_data->>'title'
           OR previous_description IS DISTINCT FROM question_data->>'description'
           OR previous_type::text IS DISTINCT FROM question_data->>'type'
           OR previous_options IS DISTINCT FROM requested_options THEN
          RAISE EXCEPTION 'application_form_questions_answered_immutable' USING ERRCODE = 'P0001';
        END IF;
      END IF;

      UPDATE application_questions AS questions
      SET title = question_data->>'title',
          description = question_data->>'description',
          type = (question_data->>'type')::application_question_type,
          is_required = (question_data->>'isRequired')::boolean,
          "order" = (question_data->>'order')::integer
      WHERE questions.id = saved_question_id AND questions.form_id = p_form_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'application_form_questions_invalid_id' USING ERRCODE = 'P0001';
      END IF;
    ELSE
      saved_question_id := gen_random_uuid();
      INSERT INTO application_questions
        (id, form_id, title, description, type, is_required, "order")
      VALUES
        (saved_question_id, p_form_id, question_data->>'title', question_data->>'description',
         (question_data->>'type')::application_question_type,
         (question_data->>'isRequired')::boolean, (question_data->>'order')::integer);
    END IF;

    -- 삭제와 재삽입은 한 트랜잭션 안에서만 보이므로 제출자는 빈 선택지를 읽지 않는다.
    DELETE FROM application_question_options AS options
    WHERE options.question_id = saved_question_id;

    IF question_data->>'type' IN ('MULTIPLE_CHOICE', 'CHECKBOX', 'DROPDOWN') THEN
      FOR option_data IN SELECT value FROM jsonb_array_elements(COALESCE(question_data->'options', '[]'::jsonb)) LOOP
        INSERT INTO application_question_options (question_id, value, "order")
        VALUES (saved_question_id, option_data->>'value', (option_data->>'order')::integer);
      END LOOP;
    END IF;

    saved_ids := saved_ids || to_jsonb(saved_question_id::text);
  END LOOP;

  UPDATE application_forms AS forms
  SET questions_revision = current_revision + 1,
      updated_at = now()
  WHERE forms.id = p_form_id;

  revision := current_revision + 1;
  question_ids := saved_ids;
  RETURN NEXT;
END;
$function$;
