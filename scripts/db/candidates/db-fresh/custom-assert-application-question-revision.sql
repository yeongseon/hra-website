-- 제출 배치가 질문을 읽은 뒤 편집이 확정됐다면 제출을 거부한다 (#98).
-- FOR SHARE는 질문 저장의 FOR UPDATE와 충돌하며 배치 커밋까지 유지된다.
CREATE OR REPLACE FUNCTION public.assert_application_form_questions_revision(
  p_form_id uuid,
  p_expected_revision integer
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  current_revision integer;
  published boolean;
BEGIN
  SELECT forms.questions_revision, forms.is_published
  INTO current_revision, published
  FROM application_forms AS forms
  WHERE forms.id = p_form_id
  FOR SHARE;

  IF NOT FOUND OR NOT published THEN
    RAISE EXCEPTION 'application_form_unavailable' USING ERRCODE = 'P0001';
  END IF;
  IF current_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'application_form_questions_stale' USING ERRCODE = 'P0001';
  END IF;
END;
$function$;
