# 예약 ID 정리 인덱스 변경 (#287)

이 변경은 `rate_limit_events(reservation_id)`의 **비고유 단일 열 B-tree 인덱스**만 추가합니다.
로그인 성공 시 같은 예약의 여러 축을 삭제하는 `releaseSuccessfulLogin()`과 지원서 예약 연결 UPDATE를 지원합니다.
기존 `(scope, key_hash, attempted_at)`, `(attempted_at)`, `(submission_id)` 인덱스·예약 함수·정리 정책은 유지합니다.

## 모델과 적용 순서

변경 식별자는 `287-rate-limit-reservation-index`이며 SQL은 `scripts/migrate-287-rate-limit-reservation-index.sql`입니다.
과거 `scripts/sql/rate-limit-reservations.sql`은 수정하지 않습니다. 전역 migration runner나 배포 gate를 추가하는 변경도 아닙니다.

- **새 빈 개발 DB:** [DB 변경 절차](database-change-procedure.md)에 따라 Drizzle 기본 스키마를 설치합니다. 새 모델은 `idx_rate_limit_reservation_id`를 포함합니다. 필수 추가 SQL·함수를 설치합니다. #121 예약 함수는 기존 `db:migrate-rate-limit-reservations` 설치 절차를 따르고, 이번 SQL로 같은 인덱스 정의와 상태를 검증합니다.
- **기존 격리 DB:** 기존 #121 예약 테이블·함수 설치 뒤 이번 SQL을 적용합니다. SQL은 기존 행·함수·인덱스를 수정하지 않습니다.
- **테이블도 없는 DB:** 이번 SQL만으로 기본 스키마를 만들지 않고 `reservation_index_table_missing`으로 중단합니다.

격리·폐기 가능한 DB를 대상으로만 다음 검증을 수행합니다. 연결 정보는 명령 인자·문서·로그에 적지 않습니다.

```bash
psql -X -v ON_ERROR_STOP=1 -f scripts/migrate-287-rate-limit-reservation-index.sql
```

같은 이름은 정확한 단일 열 정의와 `indisvalid/indisready/indislive=true`일 때만 재사용합니다.
잘못된 열·복합·정렬·부분·표현식·무효 정의는 `reservation_index_definition_mismatch`로 중단합니다.
다른 이름의 유효한 전체 B-tree가 `reservation_id`를 선두에 두면 복합 인덱스도 기존 커버 후보로 보고
`reservation_index_existing_coverage_review`로 중단합니다. 자동 중복 생성·삭제·이름 변경은 하지 않습니다.
다른 이름의 부분·선두 표현식·무효 인덱스는 전체 커버로 간주하지 않습니다.
첫 열이 실제 `reservation_id`라면 뒤 열의 표현식은 선두 UUID 조회를 막지 않으므로 `(reservation_id, lower(scope))`도 검토 후 중단합니다.

```sql
SELECT c.relname, i.indisvalid, i.indisready, i.indislive, pg_get_indexdef(i.indexrelid)
FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
WHERE i.indrelid='public.rate_limit_events'::regclass;
```

기대하는 새 정의는 `CREATE INDEX idx_rate_limit_reservation_id ON public.rate_limit_events USING btree (reservation_id)`입니다.
전체 커버 후보가 다른 이름으로 있다면 위 조회 결과와 모델을 검토해 별도 조정 결정을 남깁니다.

## 합성 측정과 보류한 후보

PostgreSQL 14.24의 격리 소켓 DB에서 작은 표 120행/큰 표 200,000행, 예약 이벤트는 360행/600,000행을 비교했습니다.
예약 ID당 세 축을 넣었으며 planner를 강제하지 않았습니다. 읽기는 예열 후 세 번, 쓰기는 CHECKPOINT·ROLLBACK·VACUUM을 사용한 세 번의 중앙값입니다.

- 큰 예약 표에서 단일 예약 SELECT는 shared 접근 버퍼 10,910→4, 성공 DELETE는 10,914→8, 지원서 연결 UPDATE는 10,964→69였습니다.
- 추가 예약 인덱스 크기는 약 11.16 MiB였습니다. 100행 INSERT WAL은 1,287,395→1,550,309바이트였고 FPI도 203→237로 늘었습니다. **CHECKPOINT 직후 FPI를 포함한 값이며 평상시 WAL 증가율이나 운영 지연을 뜻하지 않습니다.**
- 답변의 질문/제출 ID, 갤러리 ID, 수업일지 기수 ID, 일정 세션 부모 ID도 선택적인 큰 표 조회에서는 버퍼가 감소했습니다. 작은 표·밀집 키에서는 순차 스캔이 합리적이거나 개선되지 않은 경우가 있었고, 새 인덱스마다 INSERT WAL·공간이 증가했습니다.
- 갤러리/수업일지의 정렬 복합 인덱스는 약 1.41 MiB의 단일 열 대비 약 9.5 MiB로 커졌으나 희소/보통 조회에서 Sort를 제거하지 못했습니다. 세션 복합 대안도 같은 계획이었습니다.

따라서 이번 변경은 예약 ID 하나로 제한합니다. 나머지 다섯 FK 후보와 세 정렬 복합 대안은 실제 운영 규모·선택도·쓰기량을 확인한 후 별도로 판단합니다.
모든 FK를 자동 인덱싱하거나 합성 실행 시간에 임의 CI 임계값을 적용하지 않습니다. FK/트리거·Drizzle JSON 집계·앱·네트워크 비용은 측정에서 제외했습니다.

```bash
mkdir -p /dev/shm/hra-287-tests
TMPDIR=/dev/shm/hra-287-tests HRA_TEST_PG_BIN=/usr/lib/postgresql/14/bin \
  python3 measurements/issue-287/measure_indexes.py
```

재현 스크립트는 자체 격리 DB를 만들고 정리합니다. 계획 전문·개별 측정값은 기본 `/tmp/hra-287-evidence/report.json`에 남기며 저장소에는 포함하지 않습니다.

## 검증과 운영 적용 상태

`tests/unit/rate-limit-reservation-index-postgres.test.ts`는 새 기본 스키마·기존 데이터·재실행·정확한 카탈로그·정의 충돌·다른 이름의 선두 복합 커버를 실제 PostgreSQL에서 확인합니다.

이 SQL의 일반 `CREATE INDEX`, 트랜잭션, 쓰기/인덱스 DDL 직렬화 잠금은 **격리 검증 범위**입니다.
운영에서는 #280의 백업/복구·대상 DB·카탈로그·허용 잠금 시간·적용 승인과 배포 순서를 먼저 확인해야 합니다.
운영의 일반 생성/`CONCURRENTLY` 선택과 실패 복구 방식은 여기서 확정하지 않습니다. 운영 DDL은 실행하지 않았으며 운영 카탈로그·실행 계획·지연도 미확인입니다.
이 준비만으로 #287 또는 #280의 운영 적용 조건이 충족되었다고 간주하지 않습니다.
