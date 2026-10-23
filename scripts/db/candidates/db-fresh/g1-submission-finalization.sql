-- #280 소유 로컬 fresh 후보: 운영 적용·실제 과거 적용 이력이 아닙니다.
-- 원본 참조: scripts/migrate-academic-submission-finalization.sql
-- 검토 원본 SHA256: 4157af03e6ff2c4c8ae8d3efeb9538fecf63425c126cd5a66bf7833d02446c62
-- reviewedDelta: 3행 BEGIN; → 제외; 6행 SET LOCAL statement_timeout = '60s'; → 제외; 89행 COMMIT; → 제외
-- 원본→후보 보존 행: 1-2→11-12; 4-5→13-14; 7-88→15-96
-- 사유: 파일 transaction은 S2가 소유하며 설치 statement timeout은 더 강한 engine 한도를 적용합니다.
-- 보존: 내부 BEGIN/END·search_path·advisory lock·함수 본문/proconfig·ACL·FK/trigger·임시 expected 객체.
-- namespaceDelta: 없음. app DDL은 기존 public 명시, TEMP/INDEX는 PostgreSQL의 원래 namespace 규칙을 보존합니다.
-- 상태: S2 기본 timeoutMs=10000의 statement=7500ms/lock=5000ms/idle=10000ms 전제이며 전체 prefix 대조는 별도입니다.

-- #152 본인 권한 재검증·동일 키 복구·원자 최종화의 최소 DTO 경계입니다.
-- #144 → #147 → 보강된 #148 SQL이 선행하며 운영 활성화·Blob 접근은 수행하지 않습니다.
SET LOCAL search_path = public, pg_catalog;
SET LOCAL lock_timeout = '5s';
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
