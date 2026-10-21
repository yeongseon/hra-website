# 요청 제한 운영 절차 (#121)

요청 제한은 짧은 시간에 같은 기능을 지나치게 반복하는 것을 제어합니다. `src/lib/rate-limit.ts`를 이용하는 로그인·업로드·지원서 제출 경로는 PostgreSQL의 `reserve_rate_limit` 함수와 `rate_limit_events` 테이블을 사용합니다. **이 함수를 호출하는 앱 버전보다 먼저** 필요한 DB 객체가 준비되어 있어야 합니다.

`예약`은 작업을 시작하기 전에 이번 시도에 필요한 횟수를 기록하는 것입니다. 여러 요청이 동시에 들어와도 DB 함수가 검사와 기록을 한 작업으로 처리합니다. `제한 창`은 횟수를 세는 기간이며, 기능별 횟수·기간의 정본은 `src/lib/rate-limit-core.ts`입니다.

## 1. 설치 대상 확인과 실제 적용

[DB 변경 절차](../developer/database-change-procedure.md)에 따라 백업·대상 환경을 확인하고 격리 DB에서 먼저 적용합니다. `DATABASE_URL`은 비공개 환경변수로 준비합니다. 실제 설치에는 PostgreSQL 클라이언트 `psql`이 필요하며, 필요하면 `HRA_PSQL_BIN`으로 해당 실행 파일 경로를 지정합니다.

```bash
npm run db:migrate-rate-limit-reservations
```

이 기본 명령은 연결 문자열에서 **호스트와 DB명을 표시하고 끝납니다. DB에 접속하거나 설치 상태를 검사하지 않습니다.** 표시가 맞으면 승인된 대상에만 다음 명령을 실행합니다.

```bash
npm run db:migrate-rate-limit-reservations -- --confirm-apply
```

설치 SQL은 한 트랜잭션으로 실행되며 재실행해도 기존 이벤트를 지우지 않습니다. `rate_limit_events` 및 함수 존재 여부와 관련 테스트를 확인합니다. 함수가 없거나 예약 저장에 실패하면 해당 요청은 허용으로 넘기지 않습니다.

**정상 결과:** SQL 적용이 오류 없이 끝나고 [카탈로그 확인](../developer/database-change-procedure.md)과 로그인 등 관련 기능 검사가 통과합니다. **실패하면:** 대상·`psql` 설치·DB 오류를 확인하고 실제 적용 여부를 읽어 확인한 뒤 재시도를 결정합니다.

## 2. 오래된 기록의 예약 정리

`vercel.json`에는 `/api/cron/cleanup-rate-limits`가 `0 3 * * *`로 등록되어 있습니다. 일정의 기준은 UTC이며 **매일 03:00 UTC, 한국 시간 12:00**입니다. 실제 호출 여부는 해당 환경의 배포·Cron 설정과 실행 결과로 확인합니다.

1. 이 일일 작업을 운영할 Production 환경에 긴 임의의 `CRON_SECRET`을 등록하고 새 배포에 반영합니다.
2. Vercel이 호출 시 `Authorization: Bearer ...`로 전달한 값과 앱 설정을 비교합니다. 값 자체는 로그·문서·명령 이력에 남기지 않습니다.
3. 다음 일정의 실행 기록과 HTTP 상태를 확인합니다.

| 응답 | 의미 | 다음 행동 |
| --- | --- | --- |
| 200 | 정리 완료 | 정상 실행 기록 보관 |
| 503 | `CRON_SECRET` 미설정 | 대상 환경 설정과 배포 반영 확인 |
| 401 | 호출 인증 실패 | 호출 주체·환경·secret 일치 확인 |
| 500 | DB 조회·정리 중 실패 | 시각·오류 종류와 DB 적용 상태 점검 |

일일 정리는 가장 긴 제한 창 24시간보다 긴 **48시간 이전 기록**을 삭제합니다. 신규 이벤트와 기존 `login_attempts`, `upload_rate_limit_log`, `application_submissions_log`를 대상으로 하며, 없는 과거 테이블은 건너뜁니다. 사용자 콘텐츠나 지원서 본문을 삭제하는 작업은 아닙니다.

신규 이벤트에는 IP·이메일 원문을 저장하지 않고 해시를 사용합니다. 지원서가 삭제되면 연결된 신규 이벤트는 외래 키로 함께 지워지고, 과거 제출 로그는 서버가 해당 이메일 조건으로 함께 정리합니다.

## 3. 제한이 예상과 다르게 동작할 때

사용자에게는 잠시 뒤 재시도를 안내하고, 운영자는 기능·시각·설정 환경을 확인합니다. 원인을 확인하기 전에 제한 테이블을 비우거나 함수를 우회하지 않습니다.

Vercel 전용 IP 헤더가 없거나 형식이 잘못되면 해당 요청들은 `unknown` 키로 묶입니다. 정상 사용자가 함께 제한되는 현상이 있으면 프록시·배포 환경의 헤더 전달을 확인합니다. 실제 IP나 이메일 원문을 공개 이슈에 붙일 필요는 없습니다.

학사 업로드 정리와 파일 소유권 정리는 다른 작업입니다. 이 일일 일정이 그 파일들까지 정리한다고 판단하지 않습니다. 각각 [학사 업로드](../developer/academic-assignment-uploads.md)와 [파일 소유권 정리](markdown-image-ownership.md)를 따릅니다.

## 근거

`src/lib/rate-limit.ts`, `src/lib/rate-limit-core.ts`, `scripts/migrate-rate-limit-reservations.mjs`, `scripts/sql/rate-limit-reservations.sql`, `src/app/api/cron/cleanup-rate-limits/route.ts`, `vercel.json`.

외부 서비스의 호출 인증과 관리 방법: [Vercel Cron 운영 문서](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
