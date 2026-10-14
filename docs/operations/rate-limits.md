# 요청 제한 운영 절차 (#121)

로그인, 이미지 업로드, 지원서 제출은 PostgreSQL의 `reserve_rate_limit` 함수와
`rate_limit_events` 테이블을 사용합니다. **애플리케이션 배포 전에** 이 함수와
테이블을 설치해야 합니다. 미설치 상태에서는 요청 제한 예약이 실패해 해당 요청이
차단됩니다.

1. 운영 DB 백업과 `.env`의 `DATABASE_URL` 대상을 확인합니다.
2. `npm run db:migrate-rate-limit-reservations`로 호스트와 DB명을 확인합니다.
3. 승인된 대상에 `npm run db:migrate-rate-limit-reservations -- --confirm-apply`를 실행합니다.
   설치 SQL은 하나의 트랜잭션이며 재실행해도 기존 이벤트를 지우지 않습니다.
4. Vercel Production에 임의의 긴 `CRON_SECRET`을 설정합니다. Vercel은 일일 작업을
   호출할 때 이 값을 `Authorization: Bearer ...` 헤더로 전달합니다.
5. 배포 후 로그인·업로드·지원서 제출이 작동하는지 확인하고, 다음 UTC 03:00 작업의
   응답이 200인지 확인합니다. `CRON_SECRET` 누락은 503, 인증 실패는 401입니다.

일일 작업은 가장 긴 제한 창인 24시간보다 긴 48시간을 보존하고, 신규 예약 이벤트와
기존 `login_attempts`, `upload_rate_limit_log`, `application_submissions_log`를
정리합니다. 신규 이벤트에는 IP와 이메일 원문을 저장하지 않습니다. 지원서가 삭제되면
연결된 신규 이벤트는 외래 키로 함께 지워지고, 과거 제출 로그는 이메일로 찾아 삭제합니다.

Vercel 전용 IP 헤더가 없거나 잘못된 경우 모든 해당 요청은 `unknown` 키로 묶입니다.
운영 환경에서 헤더 전달 문제가 확인되면 프록시 설정을 점검해야 합니다.
