# 버전 SQL 소스 등록 범위

현재 migration manifest는 `unset`이며 versioned SQL은 없습니다. 빈 목록 검사가 통과해도 초기 설치·운영 baseline·적용 이력이 준비됐다는 뜻은 아닙니다.

향후 검토한 SQL만 이 디렉터리에 넣고 `scripts/db/migration-manifest.json`에 원본 bytes의 SHA256과 순서·ID·경로를 등록합니다. `configured`는 등록된 소스가 있다는 뜻이며 운영 승인이나 DB 적용 완료를 뜻하지 않습니다. 기존 `scripts/db/source-inventory.json`의 legacy 17개 SQL을 자동 복사하거나 이미 적용된 migration으로 바꾸지 않습니다.

실행 계약 `postgresql-file-transaction-v1`과 각 `transaction: "required"`는 검토한 파일 단위 transaction을 요구하는 선언입니다. S1 검사는 SQL 문법이나 transaction 지원을 파싱·실행해 보증하지 않습니다. 실제 적용기·lock·catalog 검증은 별도 후속 작업입니다.

## 순수 snapshot 검사의 범위

`validateLedgerSnapshot`은 호출자가 전달한 JSON의 `schemaVersion`, `nativeLedgerExists`, `ledgerExists`, `ledgerSchemaVersion`, `rows`만 허용합니다. `nativeLedgerExists`는 **관측했다는 native ledger 테이블의 존재 flag**이며 행이 비어 있어도 거부합니다. `drizzle` 스키마 디렉터리 이름만으로 native 테이블이 있다고 추정하지 않습니다. native와 자체 ledger가 함께 있다는 입력도 거부합니다.

자체 ledger가 없으면 schema version은 `null`이고 rows는 빈 배열이어야 합니다. 자체 ledger가 있으면 지원 schema version은 `1`이며 각 row의 `id`, `sequence`, `sha256`, `status: "applied"`가 manifest의 정확한 성공 prefix와 일치해야 합니다. 현재 전체 manifest digest를 기존 row에 강요하지 않으므로 올바른 뒤쪽 migration 추가가 이전 row를 바꾸지 않습니다. 알 수 없는 필드나 실패 row는 승인·성공 이력으로 인정하지 않습니다.

이 JSON은 실제 DB 관측·catalog 검사·대상·승인의 증거가 아닙니다. S1에는 DB inspector나 적용기가 없습니다. prior manifest 비교도 전달된 이전 prefix와의 불변성만 검사하며 이전 입력 자체의 신뢰성을 증명하지 않습니다.

## 로컬 소스 검사

저장소 루트에서 `node scripts/check-db-migration-manifest.mjs`를 실행합니다. manifest와 등록 SQL은 Git 추적 파일이어야 합니다. versioned 범위의 미추적 SQL은 ignore 여부와 무관하게 등록 검사에 포함합니다. SQL 원본을 실행하거나 import하지 않습니다.

선택 인자 `--prior-manifest <상대경로.json>`와 `--ledger-snapshot <상대경로.json>`은 순수 비교 입력입니다. 경로의 어느 구간이라도 symlink이거나 저장소 밖 경로이면 거부합니다. JSON은 파일당 1MiB, SQL은 파일당 2MiB·전체 16MiB, migration은 1,000개로 제한합니다. 진단에는 입력 경로·SQL·DB 값 대신 고정 코드만 출력합니다. 출력의 `observedDatabase`와 `readyToApply`는 항상 `false`입니다.
