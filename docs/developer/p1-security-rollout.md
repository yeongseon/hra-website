# P1 보안 수정 적용 절차 (#88, #89, #91, #267)

## 범위와 한계

- #89: 강의자료 목록·상세·메타데이터는 동일한 서버 SQL 권한 조건을 적용합니다.
  MEMBER는 학생용, FACULTY/ADMIN은 학생용·교수용만 조회합니다.
  공개 Blob URL 자체의 비공개화는 정책 이슈 #101의 별도 작업입니다.
- #88: 소유권이 확인되지 않은 본문 URL 자동 삭제를 중단합니다.
  게시글 삭제·편집 후 본문 파일이 남을 수 있으며, 이는 오삭제보다 보존을 우선하는 안전 조치입니다.
  파일 등록·공유 참조 모델과 안전한 GC는 후속 작업입니다. 서버 등록 첨부파일 정리는 유지합니다.
- #91: 질문 삭제 시 답변을 CASCADE로 지우지 않습니다.
  양식·기수 전체 삭제는 기존 연쇄 정리를 유지하도록 FK 검사를 커밋 시점까지 지연합니다.

## DB 적용 순서

1. 백업과 복구 절차를 확인하고 별도 테스트 DB에서 아래 SQL을 먼저 검증합니다.
2. 관리자가 대상 DB를 명시해 `scripts/migrate-protect-application-answers.sql`을 실행합니다.
   `psql -v ON_ERROR_STOP=1 -f scripts/migrate-protect-application-answers.sql`을 사용하되
   대상 연결 정보는 안전한 환경변수/비밀 관리 수단으로 전달합니다. 이 문서에 기록하지 않습니다.
3. 다음 조건을 확인한 뒤 앱을 배포합니다.

```sql
SELECT conname, confdeltype, condeferrable, condeferred, convalidated
FROM pg_constraint
WHERE conrelid = 'public.application_answers'::regclass
  AND conname = 'application_answers_question_id_application_questions_id_fk';
-- 기대값: confdeltype=a, condeferrable=true, condeferred=true, convalidated=true
```

SQL은 테이블 잠금 시간 제한이 있고 한 트랜잭션에서 FK를 교체합니다.
실패 시 전체 변경이 롤백되며, 기존 데이터를 삭제하거나 변환하지 않습니다.
운영 DB에는 자동 실행하지 않습니다. 이 SQL 적용 전에는 #91 보호가 활성화되지 않습니다.

## 스키마 도구 주의

현재 Drizzle 스키마 API는 FK의 `DEFERRABLE INITIALLY DEFERRED`를 표현하지 못합니다.
`schema.ts`의 `no action`만 적용해서는 양식·기수 전체 삭제가 실패할 수 있습니다.
새 DB 구성 또는 `drizzle-kit push`로 FK가 재생성된 뒤에는 위 SQL을 적용하고
카탈로그의 지연 검사 플래그를 다시 확인해야 합니다.
앱만 롤백하더라도 답변 보호 FK는 유지합니다. CASCADE로 되돌리면 데이터 유실 문제가 재발합니다.

## 격리된 검증

```sh
HRA_TEST_PG_BIN=/path/to/postgresql/bin npm test
npm run typecheck
npm run build
```

PostgreSQL 테스트는 임시 디렉터리에 새 클러스터를 만들고 유닉스 소켓으로만 연결합니다.
기존 DATABASE_URL이나 .env를 읽지 않으며 종료 시 서버와 파일을 정리합니다.
HRA_TEST_PG_BIN이 없으면 DB 테스트는 명시적으로 건너뜁니다.
인가 SQL, 마이그레이션 재실행, 답변 보호, 질문·양식·기수·제출 삭제,
두 연결의 FK 잠금 경합을 검사합니다. 운영 계정·파일로 파괴적 테스트를 하지 않습니다.

## Auth.js 보안 수정 확인 (#267)

`next-auth`는 `5.0.0-beta.32`, 실제 사용하는 `@auth/core`는 `0.41.3`으로 갱신합니다.
[공식 보안 공지](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-x445-f3h2-j279)의
수정 버전입니다. 이 변경은 현재 HRA에서 계정 탈취를 재현했다는 의미가 아닙니다.

현재 `src/lib/auth.ts`는 Google·Kakao 제공자의 `checks`를 덮어쓰지 않습니다.
이 버전의 기본 검사는 PKCE이며, `redirectProxyUrl`이 적용되면 state 검사가 추가됩니다.
state·nonce가 모든 환경에서 기본 활성화된다고 가정하지 않습니다([업스트림 기본값](https://github.com/nextauthjs/next-auth/blob/next-auth%405.0.0-beta.32/packages/core/src/lib/utils/providers.ts)).
수정 버전은 PKCE·state·nonce 검사 쿠키를 생성한 제공자와 callback의 제공자가 같은지 확인합니다([검사 쿠키 처리](https://github.com/nextauthjs/next-auth/blob/next-auth%405.0.0-beta.32/packages/core/src/lib/actions/callback/oauth/checks.ts)).
배포 전에 시작한 OAuth 흐름의 쿠키에는 이 정보가 없을 수 있으므로,
업데이트 직후 실패한 로그인은 로그인 화면에서 새로 시작합니다.

HRA는 Auth.js 저장 어댑터를 설정하지 않고 `handleOAuthSignIn`에서 DB 계정 바인딩을 검증합니다.
이메일만으로 다른 제공자의 계정을 병합하지 않으며, 로그인 뒤 JWT도 제공자·계정 식별자 또는
검증한 사용자 ID로 조회합니다. 향후 #273에서 계정 연결이나 저장 어댑터를 도입한다면
로그인 상태의 추가 계정 연결 경로까지 공식 공지의 전제와 다시 대조해야 합니다.

검증할 때는 다음 결과를 구분합니다.

- `npm ls next-auth @auth/core`: 실제 설치가 위 수정 버전 조합인지 확인합니다.
- 기본 CI의 보안 버전 하한 검사와 격리 OAuth 테스트: 합성 응답으로 정상 처리와 제공자 혼동 거부를 확인합니다.
- 기존 계정 바인딩·placeholder 이메일·sessionVersion 및 학사 G1 검사: 앱의 저장·세션·권한 계약을 확인합니다.
- 실제 Google·Kakao 로그인: 운영 또는 승인된 검증 환경에서 각 콘솔의 callback URI·동의 항목·앱 설정과 함께 별도로 확인합니다.

격리 테스트의 성공이 실제 제공자 콘솔 설정이나 운영 로그인 성공을 증명하지는 않습니다.
실제 제공자 확인이 남으면 PR에 `Refs #267`을 사용하고, 패키지 병합만으로 이슈를 닫지 않습니다.
