-- 요청 제한 이벤트와 원자적 예약 함수 (#121).
-- 하나의 트랜잭션에서 설치하며, 재실행해도 기존 이벤트를 지우지 않습니다.

CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL,
  scope varchar(32) NOT NULL,
  key_hash varchar(64) NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  submission_id uuid REFERENCES public.application_submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_scope_key_time
  ON public.rate_limit_events (scope, key_hash, attempted_at);
CREATE INDEX IF NOT EXISTS idx_rate_limit_attempted_at
  ON public.rate_limit_events (attempted_at);
CREATE INDEX IF NOT EXISTS idx_rate_limit_submission_id
  ON public.rate_limit_events (submission_id);

-- 겹치는 제한 축의 잠금을 정렬해 교착을 피합니다. 각 SQL 조회는 잠금 대기 후
-- 최신 커밋을 읽으므로 동시에 도착한 요청도 상한을 넘겨 예약되지 않습니다.
CREATE OR REPLACE FUNCTION public.reserve_rate_limit(
  p_scopes text[],
  p_key_hashes text[],
  p_limits integer[],
  p_windows_seconds integer[]
)
RETURNS TABLE(allowed boolean, retry_after_sec integer, reservation_id uuid)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_length integer := array_length(p_scopes, 1);
  v_index integer;
  v_lock_key bigint;
  v_count bigint;
  v_oldest timestamptz;
  v_now timestamptz;
  v_retry integer := 0;
  v_reservation_id uuid := gen_random_uuid();
BEGIN
  IF v_length IS NULL OR v_length <> array_length(p_key_hashes, 1)
     OR v_length <> array_length(p_limits, 1)
     OR v_length <> array_length(p_windows_seconds, 1) THEN
    RAISE EXCEPTION 'invalid rate limit dimensions';
  END IF;

  FOR v_index IN 1..v_length LOOP
    IF p_scopes[v_index] IS NULL OR length(p_scopes[v_index]) > 32
       OR p_key_hashes[v_index] IS NULL OR length(p_key_hashes[v_index]) <> 64
       OR p_limits[v_index] IS NULL OR p_limits[v_index] < 1
       OR p_windows_seconds[v_index] IS NULL OR p_windows_seconds[v_index] < 1 THEN
      RAISE EXCEPTION 'invalid rate limit policy';
    END IF;
  END LOOP;

  FOR v_lock_key IN
    SELECT DISTINCT hashtextextended(p_scopes[s.idx] || ':' || p_key_hashes[s.idx], 0) AS lock_key
    FROM generate_subscripts(p_scopes, 1) AS s(idx)
    ORDER BY lock_key
  LOOP
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END LOOP;

  v_now := clock_timestamp();
  FOR v_index IN 1..v_length LOOP
    SELECT count(*), min(e.attempted_at)
      INTO v_count, v_oldest
      FROM rate_limit_events AS e
      WHERE e.scope = p_scopes[v_index]
        AND e.key_hash = p_key_hashes[v_index]
        AND e.attempted_at > v_now - make_interval(secs => p_windows_seconds[v_index]);

    IF v_count >= p_limits[v_index] THEN
      v_retry := GREATEST(
        v_retry,
        1,
        ceil(extract(epoch FROM (
          v_oldest + make_interval(secs => p_windows_seconds[v_index]) - v_now
        )))::integer
      );
    END IF;
  END LOOP;

  IF v_retry > 0 THEN
    RETURN QUERY SELECT false, v_retry, NULL::uuid;
    RETURN;
  END IF;

  FOR v_index IN 1..v_length LOOP
    INSERT INTO rate_limit_events (reservation_id, scope, key_hash, attempted_at)
    VALUES (v_reservation_id, p_scopes[v_index], p_key_hashes[v_index], v_now);
  END LOOP;

  RETURN QUERY SELECT true, 0, v_reservation_id;
END;
$$;
