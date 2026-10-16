-- #152 본인 권한 재검증·동일 키 복구·원자 최종화의 최소 DTO 경계입니다.
-- #144 → #147 → 보강된 #148 SQL이 선행하며 운영 활성화·Blob 접근은 수행하지 않습니다.
BEGIN;
SET LOCAL search_path = public, pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT pg_advisory_xact_lock(hashtextextended('hra:academic-submission-finalization:v1',0));

CREATE OR REPLACE FUNCTION public.complete_academic_assignment_submission(
  p_target_id uuid, p_actor_id uuid, p_intent_id uuid, p_submission_key uuid, p_finalize boolean
) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $complete$
DECLARE
  existing public.assignment_submissions;
  intent public.assignment_upload_intents;
  final_id uuid;
  result jsonb;
  is_replay boolean := false;
BEGIN
  IF p_target_id IS NULL OR p_actor_id IS NULL OR p_intent_id IS NULL OR p_submission_key IS NULL OR p_finalize IS NULL THEN
    RAISE SQLSTATE 'SUB02' USING MESSAGE='제출 요청을 확인할 수 없습니다.';
  END IF;
  -- #148의 대상 → 계정 → 학생/학적 → 과제 → 의도 순서와 맞춥니다.
  PERFORM 1 FROM public.assignment_targets WHERE id=p_target_id FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'SUB02' USING MESSAGE='본인 제출 대상을 찾을 수 없습니다.'; END IF;
  BEGIN
    PERFORM public.assert_academic_submission_owner(p_target_id,p_actor_id,false);
  EXCEPTION WHEN raise_exception THEN
    RAISE SQLSTATE 'SUB02' USING MESSAGE='현재 본인 제출 권한을 확인할 수 없습니다.';
  END;
  -- 공통 함수 보강과 별개로 wrapper도 현재 MEMBER·활성 학적·시각을 명시 검사합니다.
  IF NOT EXISTS (SELECT 1 FROM public.assignment_targets t
    JOIN public.cohort_enrollments e ON e.id=t.enrollment_id
    JOIN public.academic_students s ON s.id=e.student_id
    JOIN public.users u ON u.id=s.user_id
    JOIN public.assignments a ON a.id=t.assignment_id
    WHERE t.id=p_target_id AND u.id=p_actor_id AND u.role='MEMBER'
      AND e.status='ENROLLED' AND e.ended_at IS NULL
      AND e.enrolled_at<=clock_timestamp() AND e.created_at<=clock_timestamp()
      AND e.cohort_id=a.cohort_id AND a.status IN ('PUBLISHED','CLOSED')
      AND a.published_at IS NOT NULL AND a.published_at<=clock_timestamp()) THEN
    RAISE SQLSTATE 'SUB02' USING MESSAGE='현재 본인 제출 권한을 확인할 수 없습니다.';
  END IF;

  -- 성공 복구는 마감·의도 만료·CONSUMED 검사보다 먼저 수행합니다.
  SELECT * INTO existing FROM public.assignment_submissions WHERE submission_key=p_submission_key;
  IF FOUND THEN
    IF existing.assignment_target_id<>p_target_id OR existing.submitted_by_user_id<>p_actor_id OR existing.upload_intent_id<>p_intent_id THEN
      RAISE SQLSTATE 'SUB01' USING MESSAGE='다른 제출에 사용한 요청입니다.';
    END IF;
    final_id := existing.id;
    is_replay := true;
  ELSE
    IF EXISTS (SELECT 1 FROM public.assignment_submissions WHERE assignment_target_id=p_target_id) THEN
      RAISE SQLSTATE 'SUB01' USING MESSAGE='이미 최종 제출한 과제입니다.';
    END IF;
    IF NOT p_finalize THEN RETURN NULL; END IF;
    -- 이 시점까지 외부 Blob 검증은 #151 서버가 완료했어야 합니다.
    SELECT * INTO intent FROM public.assignment_upload_intents WHERE id=p_intent_id FOR UPDATE;
    IF NOT FOUND OR intent.assignment_target_id<>p_target_id OR intent.user_id<>p_actor_id THEN
      RAISE SQLSTATE 'SUB02' USING MESSAGE='본인 업로드 의도를 찾을 수 없습니다.';
    END IF;
    IF intent.expires_at<=clock_timestamp() THEN
      RAISE SQLSTATE 'SUB03' USING MESSAGE='업로드 유효기간이 지났습니다.';
    END IF;
    IF intent.state<>'VERIFIED' THEN
      RAISE SQLSTATE 'SUB04' USING MESSAGE='서버 파일 검증이 필요합니다.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.assignments a JOIN public.assignment_targets t ON t.assignment_id=a.id
      WHERE t.id=p_target_id AND a.status='PUBLISHED' AND a.due_at>clock_timestamp()) THEN
      RAISE SQLSTATE 'SUB05' USING MESSAGE='과제 제출 기한이 지났습니다.';
    END IF;
    SELECT public.finalize_academic_assignment_submission(p_target_id,p_actor_id,p_intent_id,p_submission_key) INTO final_id;
  END IF;

  -- 저장 키·URL·사용자/학적 ID·체크섬은 브라우저로 반환하지 않습니다.
  SELECT jsonb_build_object('assignmentId',t.assignment_id,'submissionId',s.id,
    'submittedAt',s.submitted_at,'replayed',is_replay,
    'file',jsonb_build_object('fileId',f.id,'originalName',f.original_name,'mimeType',f.mime_type,'sizeBytes',f.size_bytes))
    INTO result FROM public.assignment_submissions s
    JOIN public.assignment_targets t ON t.id=s.assignment_target_id
    JOIN public.assignment_submission_files f ON f.submission_id=s.id
    JOIN public.assignment_upload_intents i ON i.id=s.upload_intent_id
    WHERE s.id=final_id AND s.assignment_target_id=p_target_id AND s.submitted_by_user_id=p_actor_id AND i.state='CONSUMED';
  IF result IS NULL THEN RAISE EXCEPTION '제출 완료 기록의 일관성을 확인할 수 없습니다.'; END IF;
  RETURN result;
END;
$complete$;
REVOKE ALL ON FUNCTION public.complete_academic_assignment_submission(uuid,uuid,uuid,uuid,boolean) FROM PUBLIC;
COMMIT;
