-- #144 운영 적용 전 읽기 전용 점검. 출력은 건수뿐이며 이름·이메일·계정 ID를 노출하지 않는다.
-- 새 테이블이 없어도 실행할 수 있다. 기존 회원 기수와 학적은 서로 다른 정본이므로 자동 동기화하지 않는다.
BEGIN READ ONLY;
SET LOCAL search_path = public, pg_catalog;
SET LOCAL statement_timeout = '30s';

SELECT jsonb_build_object(
  'users_count', (SELECT count(*) FROM public.users),
  'cohorts_count', (SELECT count(*) FROM public.cohorts),
  'legacy_users_without_cohort_count', (SELECT count(*) FROM public.users WHERE cohort_id IS NULL),
  'legacy_users_invalid_cohort_count', (SELECT count(*) FROM public.users u
    LEFT JOIN public.cohorts c ON c.id = u.cohort_id WHERE u.cohort_id IS NOT NULL AND c.id IS NULL),
  'academic_students_exists', to_regclass('public.academic_students') IS NOT NULL,
  'cohort_enrollments_exists', to_regclass('public.cohort_enrollments') IS NOT NULL
) AS preflight;

DO $preflight$
DECLARE
  student_count bigint;
  unlinked_count bigint;
  duplicate_count bigint;
  invalid_count bigint;
  enrollment_count bigint;
  legacy_difference_count bigint;
BEGIN
  IF (to_regclass('public.academic_students') IS NULL) <>
     (to_regclass('public.cohort_enrollments') IS NULL) THEN
    RAISE EXCEPTION '학적 테이블이 일부만 있습니다. 구조를 검토한 뒤 forward-fix 하세요.';
  END IF;
  IF to_regclass('public.academic_students') IS NOT NULL THEN
    SELECT count(*), count(*) FILTER (WHERE user_id IS NULL)
      INTO student_count, unlinked_count FROM public.academic_students;
    SELECT count(*) INTO duplicate_count FROM (
      SELECT user_id FROM public.academic_students WHERE user_id IS NOT NULL
      GROUP BY user_id HAVING count(*) > 1
    ) duplicates;
    SELECT count(*) INTO invalid_count FROM public.academic_students s
      LEFT JOIN public.users u ON u.id = s.user_id
      WHERE s.user_id IS NOT NULL AND u.id IS NULL;
    IF duplicate_count > 0 OR invalid_count > 0 THEN
      RAISE EXCEPTION '학생 계정 연결 중복/고아 참조: % / %건', duplicate_count, invalid_count;
    END IF;

    SELECT count(*) INTO enrollment_count FROM public.cohort_enrollments;
    SELECT count(*) INTO duplicate_count FROM (
      SELECT student_id, cohort_id FROM public.cohort_enrollments
      GROUP BY student_id, cohort_id HAVING count(*) > 1
    ) duplicates;
    SELECT count(*) INTO invalid_count FROM public.cohort_enrollments e
      LEFT JOIN public.academic_students s ON s.id = e.student_id
      LEFT JOIN public.cohorts c ON c.id = e.cohort_id
      LEFT JOIN public.users creator ON creator.id = e.created_by_user_id
      WHERE s.id IS NULL OR c.id IS NULL OR
        (e.created_by_user_id IS NOT NULL AND creator.id IS NULL);
    IF duplicate_count > 0 OR invalid_count > 0 THEN
      RAISE EXCEPTION '기수 등록 중복/고아 참조: % / %건', duplicate_count, invalid_count;
    END IF;
    -- 여러 기수 학적은 정상이다. 기존 회원 기수와의 차이는 운영진 검토용 건수로만 표시한다.
    SELECT count(*) INTO legacy_difference_count FROM public.cohort_enrollments e
      JOIN public.academic_students s ON s.id = e.student_id
      JOIN public.users u ON u.id = s.user_id
      WHERE u.cohort_id IS DISTINCT FROM e.cohort_id;
    RAISE NOTICE '학생 %명 / 미연결 %명 / 기수 등록 %건 / 기존 회원 기수와 다른 학적 %건',
      student_count, unlinked_count, enrollment_count, legacy_difference_count;
  END IF;
END;
$preflight$;
COMMIT;
