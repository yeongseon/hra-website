-- #287: 성공 로그인 예약 정리·지원서 연결을 위한 단일 인덱스를 추가합니다.
-- 기존 #121 SQL은 바꾸지 않습니다. 이 변경은 격리 DB에서만 검증하며 운영 적용은
-- #280의 백업·복구·대상/카탈로그·잠금 검토 및 승인 전까지 진행하지 않습니다.
SET LOCAL lock_timeout = '5s';

DO $preflight$
DECLARE
  target_table oid := to_regclass('public.rate_limit_events');
  target_index oid;
  reservation_column smallint;
BEGIN
  IF target_table IS NULL THEN
    RAISE EXCEPTION 'reservation_index_table_missing';
  END IF;
  -- 생성 전 검사와 DDL 사이에 다른 인덱스 DDL이 끼어들지 않도록 직렬화합니다.
  -- 일반 CREATE INDEX와 함께 사용하는 격리 검증용 잠금이며 운영 방식은 별도 승인 대상입니다.
  LOCK TABLE public.rate_limit_events IN SHARE ROW EXCLUSIVE MODE;
  target_index := to_regclass('public.idx_rate_limit_reservation_id');
  SELECT attnum INTO reservation_column FROM pg_attribute
  WHERE attrelid=target_table AND attname='reservation_id' AND NOT attisdropped
    AND atttypid='uuid'::regtype AND attnotnull;
  IF reservation_column IS NULL THEN
    RAISE EXCEPTION 'reservation_index_column_mismatch';
  END IF;

  -- 같은 이름은 정확한 단일 열 B-tree 정의와 사용 가능한 상태일 때만 재사용합니다.
  IF target_index IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_index i WHERE i.indexrelid=target_index AND i.indrelid=target_table
      AND i.indisvalid AND i.indisready AND i.indislive
      AND pg_get_indexdef(i.indexrelid)=
        'CREATE INDEX idx_rate_limit_reservation_id ON public.rate_limit_events USING btree (reservation_id)'
  ) THEN
    RAISE EXCEPTION 'reservation_index_definition_mismatch';
  END IF;

  -- 다른 이름의 유효한 선두 인덱스(복합 포함)는 이미 조회를 지원할 수 있습니다.
  -- 부분·선두 표현식·무효 인덱스는 전체 커버로 오인하지 않습니다. 뒤 열의 표현식은 선두 조회를 막지 않습니다.
  -- 자동 중복 생성·삭제·이름 변경은 하지 않습니다.
  IF EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
    JOIN pg_am a ON a.oid=c.relam JOIN pg_opclass o ON o.oid=i.indclass[0]
    WHERE i.indrelid=target_table AND i.indexrelid IS DISTINCT FROM target_index
      AND i.indisvalid AND i.indisready AND i.indislive AND a.amname='btree' AND o.opcdefault
      AND i.indpred IS NULL AND i.indkey[0]=reservation_column
  ) THEN
    RAISE EXCEPTION 'reservation_index_existing_coverage_review';
  END IF;

  IF target_index IS NULL THEN
    CREATE INDEX idx_rate_limit_reservation_id ON public.rate_limit_events USING btree (reservation_id);
  END IF;
END;
$preflight$;

-- 생성 결과도 같은 계약으로 검증하며, 실패하면 이 변경 전체를 롤백합니다.
DO $verification$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i WHERE i.indexrelid=to_regclass('public.idx_rate_limit_reservation_id')
      AND i.indrelid=to_regclass('public.rate_limit_events')
      AND i.indisvalid AND i.indisready AND i.indislive
      AND pg_get_indexdef(i.indexrelid)=
        'CREATE INDEX idx_rate_limit_reservation_id ON public.rate_limit_events USING btree (reservation_id)'
  ) THEN RAISE EXCEPTION 'reservation_index_verification_failed'; END IF;
END;
$verification$;
