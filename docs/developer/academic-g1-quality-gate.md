# G1 과제 제출 품질 게이트 (#158)

학생이 과제를 열고 PDF를 제출한 뒤, 본인 파일과 관리자의 제출 현황까지 이어지는 흐름을 변경할 때 읽는다. **품질 게이트**는 변경을 합치기 전에 반드시 통과해야 하는 검사다. **G1**은 [개인 과제 제출 범위](../ASSIGNMENT-SUBMISSION-SCOPE.md)에 정한 첫 단계이며, **fixture**는 실제 개인정보를 쓰지 않고 검사에 맞춰 만든 합성 자료다.

이 실행기는 기본 CI에 연결되어 있다. 아래는 실행 방법과 통과 조건이며, 이번 문서 정비에서 CI를 새로 실행했다는 결과 보고가 아니다. 실행 환경을 준비한 뒤 명령을 수행하고, 통과·실패·정리 결과를 확인한다. 단순 화면 확인인 smoke와 실제 공급자 QA의 차이는 [전체 품질 점검](../QUALITY-GATE.md)을 함께 읽는다.

이 게이트는 운영 DB·회원·Blob·OAuth 자격정보를 받지 않는다. 실제 Next, 정상 CSRF/credentials 인증, 실제 PostgreSQL, 설치된 Blob SDK와 로컬 private HTTP 저장소를 연결한다. 인증·인가·서비스·SQL 함수를 테스트 모듈로 교체하지 않는다.

## 실행 계약

실제 환경 설정을 담은 `.env*`가 없는 격리 worktree, 설치된 Node 의존성, PostgreSQL 바이너리와 Chromium이 필요하다. `.env.example`은 실행 환경 파일이 아니다. 아래 DB 주소·인증 키는 CI와 같은 합성 값이며 빌드 준비에만 쓴다. G1 실행기는 자신의 임시 DB·인증 키를 다시 만든다. PostgreSQL 경로는 현재 장비에 맞게 바꾼다.

```sh
export DATABASE_URL=postgresql://ci:ci@127.0.0.1:1/isolated
export AUTH_SECRET=ci-only-secret-for-isolated-smoke-tests
export NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100
npm ci
npx playwright install --with-deps chromium
HRA_TEST_PG_BIN=/opt/homebrew/opt/postgresql@18/bin npm test
npm run build
HRA_TEST_PG_BIN=/opt/homebrew/opt/postgresql@18/bin \
  npm run test:academic-g1
```

Linux CI의 PostgreSQL 경로는 `pg_config --bindir`로 얻는다. runner는 기본값과 `--production` 모두 빌드된 `next start`를 실행한다. Next 개발 서버의 버전 확인용 외부 조회도 CI에 필요하지 않으므로 허용하지 않는다. 이번 실행의 임의 포트만 사용하며 공급자 URL·토큰·기존 `NODE_OPTIONS`·외부 DB 환경을 상속하지 않고 가짜 Neon `.invalid` 요청만 격리 소켓의 PostgreSQL로 전달한다.

앱은 전체 기능·업로드·학적 쓰기 gate를 테스트에서 명시적으로 켠다. 실제 환경의 기본 비활성 설정을 바꾸지 않는다. 지정 관리자는 합성 FACULTY UUID다. 홈페이지 ADMIN과 다른 FACULTY는 관리 권한을 얻지 않는다.

## 저장소 모사 범위

Node에서는 테스트 전용 undici Dispatcher가 설치 SDK의 정확한 `/api/blob` 요청 및 이번 실행의 private 호스트만 loopback 저장소에 전달한다. 브라우저는 같은 허용 경로만 Playwright `route.continue`로 일회성 HTTPS loopback 저장소에 보낸다. Chromium XHR의 실제 `File` 본문은 `postDataBuffer()`에 노출되지 않아 `route.fetch`로 복사하면 사라지므로, 원본 브라우저 전송을 유지한다. TLS 인증서는 `node:crypto`로 메모리에서 생성하며 키·인증서 파일과 추가 의존성은 없다. 해당 격리 브라우저 context만 자체 서명 인증서를 허용한다.

Playwright API 요청은 별도의 정확한 앱 URL 래퍼가 `maxRedirects: 0`을 강제한다. 준비 확인·CSRF·세션을 포함한 실행기의 fetch도 `redirect: manual`이다. 다른 포트로 향하는 실제 HTTP 302를 따라가지 않는 회귀와 실제 SDK 동시 PUT에서 한 건만 저장되는 회귀를 포함한다. 알려지지 않은 외부 주소는 차단하고 게이트를 실패시킨다. Service Worker와 redirect/retry 우회를 허용하지 않는다.

저장소는 실제 SDK가 만든 클라이언트 토큰의 HMAC, 고정 불투명 경로, 만료, MIME, 크기, 덮어쓰기 금지를 검사한다. 원본은 실제 HTTP 바이트로 저장·읽고 ETag 조건부 삭제를 지원한다. 익명 GET은 403이다. 앱 서버는 실제 SDK `head`/`get`으로 원본 PDF 시그니처·전체 바이트 수·SHA-256을 검증한 뒤 실제 DB 최종화를 수행한다. callback 미전달 상태는 인증된 verify 복구로 처리한다.

로컬 저장소는 공급자와 같은 서비스를 구현했다는 보장이 아니다. #151의 실제 공급자 PoC는 승인된 QA 환경에서 별도로 약 10분간 실제 50MiB·만료·유예·삭제를 확인한다. PR CI는 공급자 secrets나 실네트워크 없이 실행한다.

## 수용 조건 대응

| [범위 문서](../ASSIGNMENT-SUBMISSION-SCOPE.md) §7 | 자동 검증 |
| --- | --- |
| 1. 역할×기수 | A·같은 기수 동료·B·지정 FACULTY·일반 FACULTY·홈페이지 ADMIN·PENDING·익명의 실제 페이지/액션/API 요청 |
| 2. 미제출 포함 | 미연결 학생 포함 공개 대상3명, 제출 전0건, 제출 뒤 학생 완료와 현황·CSV의 대상/제출/미제출 일치 |
| 3. 중복·동시 요청 | 이중 학적 거부, 실제 최종화 액션의 같은 키 동시 재시도와 다른 키 경쟁, 최종 제출·파일 각1건 |
| 4. 실패·중단·응답 유실 | PUT/원본 GET 실패, 실제 파일 INSERT CHECK 실패, 실제 커밋 뒤 응답만 폐기하고 같은 요청 복구 |
| 5. 파일·로그 | private 익명403, 타인/없는 파일 동일404, 허용 파일 SHA-256·첨부/캐시 헤더·감사, 오류/요청 비밀값 유출 검사 |
| 6. 제출 우회 | DRAFT·다른 기수·CLOSED의 직접 요청 거부 및 현재 학적/역할/세션 철회 |
| 7. 보존 | 참조된 사용자/기수 삭제·공개 후 DRAFT 전환·이력 계정 해제 거부, 공개 후 신규 학생의 분모 불변 |
| 8. 마감 | 실제 미래 마감 공개, 마감1초 전부터 시도·마감 도달 확인 뒤·1초 뒤 실 SQL 판정, 기존 KST 변환 회귀 |
| 9. migration·복구 | 순차 적용과 각 단계 즉시 재실행, 합성 데이터 dump/restore 지문, 복구 DB의 drift 거부 및 행 보존 |
| 10. CI | 실제 Chromium 필수10사례, 누락/중복/skip/retry 성공 금지, 외부 요청0, 실행 자원 정리 |

실제 정상 흐름은 명부 확인 → #155 관리 화면/#149 액션으로 공개 → #154 학생 화면/#150 조회 → #151 SDK 업로드 → #152 최종화 → #153 파일 → #156 현황/CSV로 이어진다. 현재 빌드의 실제 액션 요청을 사용하고 action ID를 하드코딩하지 않는다.

학생 목록·상세는 모든 역할과 두 기수를 직접 요청한다. 현재 UI 계약에서 비학생 ADMIN/FACULTY는 HTTP 200의 명시적 접근 거부 안내이고, PENDING은 `/pending`, 비로그인은 `/login` 리다이렉트다. 성공 상태만 검사하지 않고 안내와 본인 기수 노출을 검증한다. 업로드는 소비된 의도의 충돌에 기대지 않고 새 공개 과제에서 MEMBER 세 명의 정상 의도·SDK 토큰과 타인·타 기수·다른 역할의 정확한 거부 상태를 비교한다.

## migration 및 마감 경계

실제 SQL 적용 순서는 #144 → #145 → #146 → #147 → #148 → #149 → #151 → #152 → #153이다. **각 SQL은 바로 그 단계에서 두 번 실행한다.** 후속 트리거를 설치한 뒤 옛 baseline 전체를 다시 실행할 수 있다고 가정하지 않는다. #144의 기존 구조 검증은 후속 구조를 의도적으로 거부할 수 있다.

마이그레이션 적용 연습은 폐기 가능한 격리 DB에 실제로 스키마를 만들어 수행한다. 쓰기를 하지 않는 명령 옵션의 dry-run과 구분한다. 각 migration이 자체 트랜잭션을 가지므로 여러 파일을 바깥 `BEGIN` 하나로 감싸 복구됐다고 주장하지 않는다. dump/restore는 이번 실행의 합성 DB에만 수행하고 메모리에서 전달한다. 운영 복구는 [DB 변경 절차](database-change-procedure.md)에 따른다.

마감은 `pg_sleep_until()` 이후 실제 `clock_timestamp()`가 마감 전/도달 후인지 확인하고 실제 최종화 함수를 호출한다. 정각 도달부터 거부됨을 검증하며 마이크로초가 완전히 같은 시각에 실행됐다고 주장하지 않는다. JS fake timer·SQL 함수 교체·OS 시계 의존성은 사용하지 않는다. KST의 정확한 instant 변환 및 #148/#152의 원자성/잠금 경합 회귀는 기존 Vitest를 함께 실행해 확인한다.

## 실패·정리·진단 정책

Chromium workers1, retries0이고 모든 필수 사례가 정확히 한 번 통과해야 한다. 실제 제출에서 받은 파일·액션을 다음 단계가 사용하므로 명시적인 serial 그룹으로 실행한다. 선행 실패 뒤 Playwright가 새 작업자를 만들고 빈 상태로 다음 단계를 실행해 별도 결함처럼 보이게 하지 않는다. 선행 실패로 후속 단계가 실행되지 않아도 reporter는 전체 게이트를 실패시킨다. 준비 상태 polling에는 상한이 있고 각 테스트에도 timeout이 있다. CI 단계에는 10분 timeout을 둔다. 성공한 재시도로 실패를 숨기지 않는다. 서로 독립인 장애 시나리오 사이에서 합성 rate-limit 원장을 초기화하며, 한 사용자 흐름 안에서는 실제 제한 함수가 그대로 실행된다. PUT 실패 후 취소·새 의도 발급 복구는 실제 60초 제한 창이 지나도록 61초를 기다리고 재전송한다. 원장 삭제나 시계 조작으로 제한을 우회하지 않는다.

trace·스크린샷·영상·HAR·storageState를 보관하지 않는다. 정상 로그인 쿠키는 브라우저 메모리에만 둔다. 설정 파일과 브라우저 임시 출력은 이번 실행의 0700 디렉터리/0600 파일에 한정한다. 로컬 Blob 바이트도 메모리에만 보관하고 작업자 종료 때 제거한다.

업로드 승인을 위해 브라우저에 필요한 의도 경로와 짧은 클라이언트 토큰은 정상 요청 계약이다. 이를 학생 조회 DTO·최종화 결과·타인 응답·서버 로그에 노출하는 것과 구분한다. runner는 원본 로그를 메모리에서 검사한 뒤 고정 사례 ID와 진단 코드만 출력한다. 실제 사용자의 이름·이메일·토큰·원본 URL·SQL 매개변수를 복사하지 않는다.

정상/실패 종료 모두 브라우저→Next→PostgreSQL을 정리한다. 로컬 저장소는 해당 브라우저 작업자가 닫는다. 임시 디렉터리를 제거한 뒤에만 정리 PASS를 기록한다. 미확정 파일과 최종 제출물의 운영 보존/파기 정책은 이 테스트의 임시 메모리 정리와 별개다.

`test:academic-g1`은 기존 필수 CI job의 빌드·Chromium 설치 뒤 실행한다. job 이름과 기존 smoke를 유지하며 fork/secrets/경로 조건, 새 secrets, 운영 환경, 추가 job 권한, `continue-on-error`를 사용하지 않는다. 설치·빌드 단계와 분리된 게이트 실행 중에는 실제 공급자·Neon·외부 서비스로 요청하지 않는다.

