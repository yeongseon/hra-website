# 모집설정 단일 행 정책

`recruitment_settings.singleton_key`는 항상 `1`이며 CHECK와 UNIQUE 제약으로 다른 키와 중복 행을 막는다. 관리자 전체 설정·현재 모집 정보·포스터·세부 안내 저장은 모두 이 키에 `INSERT ... ON CONFLICT DO UPDATE`를 사용한다. 섹션별 저장은 해당 섹션의 컬럼만 갱신한다.

`npm run db:migrate-recruitment-singleton`은 기존 행이 0~1개일 때만 실행된다. 1개면 기존 ID와 모든 값을 유지하고, 0개면 기본 행을 만든다. 2개 이상이면 아무 행도 삭제하지 않고 중단한다. 이때 `updated_at` 최신 행(동률이면 ID 역순)을 우선 검토하되, 모든 섹션 값을 비교해 보존할 행을 수동으로 결정한 뒤 재실행한다. 2026-10-14 운영 DB는 기존 행이 1개였고, 적용 후에도 1개와 두 제약이 확인됐다.
