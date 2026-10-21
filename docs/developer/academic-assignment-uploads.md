# 과제 전용 비공개 업로드 (#151)

## 저장 계약과 적용 범위

G1은 PDF 한 개, 비어 있지 않은 실제 크기 50MiB(52,428,800바이트) 이하만 허용한다.
신규 업로드·검증은 학생의 로그인 세션과 현재 유효 학적·본인 target·공개 상태·마감을 사용자 API와 DB에서 각각 확인한다.
취소 복구는 본인 소유권을 재검증하되 아래 취소 계약에 따라 마감·의도 만료 뒤에도 허용한다.
회원 역할·기수·저장 키·URL을 클라이언트 입력에서 권한 근거로 사용하지 않는다.
이 코드는 업로드 승인·검증을 제공한다. 업로드 성공/VERIFIED는 최종 제출이 아니며 최종화는 #152가 수행한다.
법적 보존·파기 기간(#142)과 출결·수료 정책을 정하지 않는다. 최종 제출물과 학적의 자동 삭제는 제공하지 않는다.

## SDK 및 공급자 PoC 근거

확인일 **2026-10-16**. 설치 SDK `@vercel/blob` **2.4.0**의 README와 `dist/client.d.ts`, `dist/index.d.ts`를 확인했다.

- [Client uploads](https://vercel.com/docs/vercel-blob/client-upload): 브라우저→Blob 직접 업로드로 Function 본문 제한을 우회한다. callback은 localhost로 전달되지 않으며 로컬 실전 검증에는 터널 또는 공개 가능한 QA URL이 필요하다.
- [Private storage](https://vercel.com/docs/vercel-blob/private-storage): private 저장소는 읽기·쓰기에 인증이 필요하고 SDK 2.3 이상을 지원한다.
- [SDK reference](https://vercel.com/docs/vercel-blob/using-blob-sdk): 토큰의 MIME·크기·만료·덮어쓰기 제한, `get()` 스트림과 `useCache:false`, ETag 조건부 삭제를 제공한다.
- [Function limits](https://vercel.com/docs/functions/limitations): 요청/응답 본문 제한은 4.5MB다. 파일 본문은 앱 API로 전송하지 않는다. 검증 함수는 Blob의 원본 스트림을 내부에서 읽고 작은 JSON만 응답한다.
- [사용량·가격](https://vercel.com/docs/vercel-blob/usage-and-pricing): client upload의 업로드 전송 비용은 없지만 저장·작업·원본 검증 다운로드 비용은 별도다. private 다운로드는 Blob→Function과 Function→사용자의 전송 항목이 구분된다. 지역·요금제에 따라 실제 청구가 달라지므로 이 문서에서 금액을 추정하지 않는다. 공식 작업 제한은 Hobby simple 1,200/분·advanced 900/분, Pro 7,200/분·4,500/분이며 계정의 현재 제한을 운영 적용 때 다시 확인한다.

50MiB는 단일 직접 PUT으로 전송한다. multipart 요청은 거부하여 불완전 multipart 세션의 별도 정리 문제를 만들지 않는다.
토큰에 예상 크기를 최대 크기로 지정하고 서버에서 저장된 실제 크기와도 비교한다.
PDF 시그니처 검증은 파일 시작의 `%PDF-` 확인이며 완전한 PDF 문법 검사나 악성코드 탐지를 뜻하지 않는다.

## API 및 검증

1. `POST /api/academic/uploads/intents`: 작은 JSON으로 assignmentId·requestId·원본 이름·선언 크기·MIME을 전달한다. 고유 의도 ID와 저장 경로, 만료 시각만 반환한다.
2. `POST /api/academic/uploads`: SDK가 토큰을 발급받는다. 같은 Origin·현재 세션·소유권·원장 경로·크기·마감을 다시 확인한다. 동일 출처의 authority는 실제 HTTP `Host`(포트 포함), 프로토콜은 Request URL을 기준으로 한다. Next가 loopback URL의 127.0.0.1을 localhost로 정규화해도 정상 로컬 요청을 거부하지 않는다. 임의 `x-forwarded-host`는 허용 근거로 사용하지 않는다. Vercel·프록시는 외부 Host와 프로토콜을 보존해야 하며, 다른 Origin·포트·프로토콜은 거부한다. 토큰은 `allowOverwrite:false`, `addRandomSuffix:false`, `multipart:false`다.
3. SDK는 private 저장소에 직접 전송한다. 키는 `academic-uploads/v1/<무작위 UUID>/document.pdf`이며 원본 이름·사용자 ID·기수 ID가 포함되지 않는다.
4. callback은 SDK가 HMAC 서명을 검증한 후 정확한 원장의 수신 시각만 멱등 기록한다. JSON 스키마 검증은 원본 객체를 재구성하지 않으므로 키 순서·추가 속성을 가진 정상 서명도 보존한다. callback만으로 VERIFIED/최종 제출을 생성하지 않는다.
5. `POST /api/academic/uploads/[id]/verify` 또는 서버 함수가 실제 원본을 검사한다. callback이 늦거나 유실되어도 인증된 학생이 이를 요청할 수 있다.

서버 통합 인터페이스는 다음과 같다.

```ts
import { verifyAssignmentUploadIntent } from "@/features/academics/assignment-uploads/server";
await verifyAssignmentUploadIntent({ assignmentId, uploadIntentId });
```

함수가 직접 `requireAssignmentTarget()`으로 실제 세션을 확인한다. private 설정의 저장소에서 DB 키로 `head`와 캐시 우회 `get`을 호출한다.
호스트·경로·MIME·크기·ETag를 비교하고 전체 스트림의 실제 바이트 수·처음 5바이트·SHA256을 확인한다.
과도한 크기·잘림·읽기 실패·시간 초과는 검증을 중단한다. ETag와 해시는 DB에 저장하며 기존 VERIFIED 재호출은 같은 원본만 허용한다.
원본을 읽는 중 권한·기한이 바뀌었어도 DB가 다시 검사한다.
`AcademicUploadError`의 code/status/message만 사용하고 SQL·원본 오류·URL·키·토큰을 응답/로그에 복사하지 않는다.
#152는 본인 권한 확인 후 동일 제출 키의 성공 복구를 먼저 수행하므로 CONSUMED/마감 후 replay에서 verifier를 호출하지 않는다.

사용자·대상별 요청 제한을 기존 PostgreSQL 원자 예약 함수로 적용하며 DB 실패는 차단한다.
발급 요청과 외부 작업을 다음 두 예산으로 분리한다 (#291). 각 예산은 사용자 6회/분·대상 4회/분이며 숫자와 60초 창을 늘리지 않는다.

| 예산 | 차감 지점 | 목적 |
|---|---|---|
| 발급 요청 | 의도 생성 API | 새 원장 발급·발급 요청 폭주 제한. 같은 requestId의 응답 복구도 발급 요청으로 센다. |
| 외부 작업 | SDK 토큰 승인 + 실제 원본 검증의 합계 | 업로드 권한 발급과 HEAD·최대 50MiB GET·해시 계산 비용 제한 |

의도 발급은 외부 작업 예산을 쓰지 않는다. 토큰과 검증은 기존 `academic-upload-user`·`academic-upload-target` scope를 계속 공유한다.
발급은 `academic-upload-intent-user`·`academic-upload-intent-target` scope를 사용한다. 모두 기존 이벤트 표의 32자 제한 안에 있으며 DB 스키마·예약 함수를 바꾸지 않는다.
SDK 토큰 발급에는 기존 IP 업로드 제한도 그대로 적용한다. 실패한 검증·발급 요청도 예약을 환불하지 않으며, DB 장애나 잘못된 예약 결과는 외부 작업 전에 503으로 차단한다.
기존 외부 scope를 유지하므로 배포 직전 의도 예약도 기존 60초 창이 만료될 때까지 보수적으로 남는다.

다음은 다른 요청이 없는 동일 창에서의 차감 수다. 최종 제출 후 교체는 계속 금지하며, 교체는 미완료 의도 취소 뒤에만 허용한다.

| 사용자 흐름 | 발급 요청 | 외부 작업 |
|---|---:|---:|
| 정상 발급·전송·검증·확정 | 1 | 2 |
| PUT 실패 → 취소 → 새 의도로 전송·검증 | 2 | 3 |
| 검증 실패 → 같은 의도로 검증 재시도 | 1 | 3 |
| 검증 실패 → 취소·파일 교체 → 새 의도로 전송·검증 | 2 | 4 |
| 성공 커밋 뒤 응답 유실 → 같은 제출 키 복구 | 추가 0 | 추가 0 |

발급 요청 4회 허용이 전체 업로드 완료 4회나 무제한 재시도를 보장하는 것은 아니다. 외부 작업 합계 상한은 독립적으로 유지한다.
최종화 서비스는 성공 키 복구를 검증보다 먼저 수행하므로 마감·업로드 중단 뒤에도 이미 확정한 결과는 새 Blob 읽기 없이 복구한다.

차단 응답은 `RATE_LIMITED`/429에만 공용 API v1과 같은 필드명 `retryAfterSeconds`를 추가하고 HTTP `Retry-After`도 반환한다.
값은 예약 함수의 `retry_after_sec`이며 학사 60초 창 범위만 전달한다. 제출 액션도 같은 필드를 반환한다.
학생 화면은 대기 초와 같은 요청 재확인, 전송 실패·파일 변경 시 기존 업로드 취소 후 새 업로드 방법을 한국어로 안내하며 파일·요청 키를 보존한다.

설치된 SDK의 `upload()`는 토큰 API 실패 본문을 읽지 않고 일반 오류를 던지므로 학사 클라이언트는 기존 토큰 API에 동일 `blob.generate-client-token` 요청을 직접 보낸다.
성공 시 공개 `@vercel/blob/client`의 `put()`에 제한된 client token을 넘긴다. 단일 PUT·진행률·취소 신호·서명 callback·서버 검증은 유지하고 토큰은 메모리에만 둔다.
서버 쓰기 토큰을 브라우저로 보내거나 전역 fetch를 교체하지 않는다. 임의 서버 메시지는 표시하지 않고 `RATE_LIMITED`의 코드·대기 시간만 검증해 고정 안내를 만든다.
한 대상의 활성 원장은 하나다. 같은 requestId·같은 입력은 같은 의도이고 다른 입력의 키 재사용은 거부한다.

## DB와 설정 적용

적용 순서는 **#144 → #147 → 최신 #148 → #151 → #152**다.
범위 SQL `scripts/migrate-academic-upload-authorizations.sql`을 격리 DB에서 신규 적용·재실행한 뒤 카탈로그를 확인한다.
컬럼·기본값·FK/CHECK/UNIQUE·인덱스 전체 키/조건이 다르면 전체 롤백한다. 기존 원장을 자동 보정하지 않는다.
Drizzle 정본 `schema.ts`에서 `academicUploadAuthorizations`를 내보내야 한다. root 통합 담당자가 export를 추가한다.
함수는 SECURITY INVOKER이며 PUBLIC EXECUTE를 제거한다. 앱 역할이 소유자와 다르면 범위 함수/표 권한만 별도로 부여한다.

필요한 서버 설정:

- `ACADEMIC_ENABLED=true`: 학사 전체 기능. 운영 표가 없으면 활성화하지 않는다.
- `ACADEMIC_UPLOADS_ENABLED=true`: 업로드 별도 공개. **기본 비활성**.
- `ACADEMIC_SUBMISSION_BLOB_HOST`: 정확한 `*.private.blob.vercel-storage.com` 호스트.
- `ACADEMIC_SUBMISSION_READ_WRITE_TOKEN`: 위 private 저장소의 서버 전용 토큰. 공개 저장소 fallback은 없다.
- `ACADEMIC_UPLOAD_CLEANUP_ENABLED=true`: 정리 작업의 별도 활성화. **기본 비활성**.
- `ACADEMIC_UPLOAD_CLEANUP_DELETE_ENABLED=true`: 실제 삭제의 추가 활성화. 없으면 **dry-run**.
- `CRON_SECRET`: 정리 API의 Bearer 인증. 일정 등록은 root 통합 담당자가 결정하며 이 PR이 자동 등록하지 않는다.

기능 롤백은 신규 업로드 공개부터 끈다. 학적·원장·최종 제출물은 삭제하지 않는다.
정리는 사용자 기능과 독립적으로 승인된 설정에서 동작할 수 있으나 운영 DB/저장소 적용·검증 전에는 켜지 않는다.

## 취소·실패·정리

`DELETE /api/academic/uploads/intents/[id]`는 본인 원장을 종료하여 이후 검증·최종화를 거부한다.
본문의 `assignmentId`로 선택한 본인 대상 ID를 DB 취소 함수의 세 번째 인자로 전달해 다른 과제의 의도 주입을 404로 거부한다.
취소는 현재 MEMBER·본인 계정 연결·활성 학적을 다시 확인하지만 과제 마감/종료나 의도 만료를 이유로 차단하지 않는다.
이미 종료한 미소비 의도의 재취소는 같은 종료 시각을 보존하며 성공한다. CONSUMED 또는 실제 최종 제출/파일 참조는 계속 거부한다.
최종화와 동일한 대상→계정→학생/학적→과제→의도→원장 잠금 순서로 직렬화하여 취소와 최종 제출 중 하나만 성공한다.
이전 두 인자 DB 취소 함수는 마이그레이션에서 제거하므로 앱 역할의 명시적 GRANT가 있다면 새 세 인자 서명에 적용한다.
원본은 즉시 삭제하지 않는다. 취소 후 새로운 requestId로 새 의도를 만들 수 있지만 이전 경로는 재사용하지 않는다.
DB 검증·최종화 실패도 사용자에게 실패를 알리고 원장에 추적된 미참조 객체로 남긴다.

발급 토큰과 의도는 최대 15분이며 과제 마감보다 늦지 않다. 이는 업로드용 기술 유효기간이며 개인정보 보존 기간이 아니다.
정리는 **실제 토큰 만료 + 5분 유예**가 끝난 뒤에만 가능하다.
DB는 대상→의도→원장 잠금을 획득하고 CONSUMED 및 제출/파일 참조가 없음을 다시 확인한 뒤 정리를 선점한다.
최종화도 같은 대상/의도 잠금을 사용하고, #151의 추가 BEFORE INSERT 트리거가 취소·정리 선점 원장의 소비를 거부한다.
선점과 Blob 삭제 사이에 새로운 최종 제출이 생성되는 경로를 닫는다. #148도 의도 만료 후 최종화를 거부한다.

정리 서비스는 원장의 정확한 namespace·호스트만 대상으로 ETag 조건부 `del()`을 실행한다.
실패는 재시도하고 원장을 삭제하지 않는다. 토큰 만료 직전 시작한 PUT이 뒤늦게 끝날 수 있으므로 삭제 완료 원장도 다시 조회한다.
상한 25개(호출당 최대 100개), 마지막 확인 시각 순으로 순환한다. 최종 제출물·다른 키·다른 도메인·추적되지 않은 객체는 삭제하지 않는다.
cron 응답에는 건수만 포함된다. 법적 보존 대상의 파기 작업으로 이 API를 사용하지 않는다.

## 검증과 실제 공급자 PoC

```bash
HRA_TEST_PG_BIN=/opt/homebrew/opt/postgresql@18/bin npm test -- tests/unit/academic-upload-*.test.ts
npm run typecheck
```

격리 PostgreSQL은 발급/감사 실패 롤백, 같은 키 동시 발급, 활성 의도 유일성, 검증 재시도, 취소 VERIFIED 최종화 거부,
마감·역할 철회, 최종 파일 보존, 정리 잠금과 최종화 경합, 인덱스 복합키 drift 거부를 검사한다.
서비스 테스트는 실제 50MiB 스트리밍·분할 시그니처·전체 SHA256, 크기/MIME/호스트/ETag 위장과
실제 SDK의 정상 HMAC(키 순서/추가 속성/중복), 위조 서명 거부를 검증한다. 이 테스트들은 공급자 실전 PoC를 대신하지 않는다.

`scripts/verify-academic-private-upload-http.mjs`는 승인된 private 저장소의 QA 전용 namespace에서 실제 공급자 경로를 실행한다. 물리적으로 별도 저장소일 필요는 없다. 기존 private 저장소를 사용할 때도 이번 실행의 무작위 경로·격리 원장 한 개만 조회·정리한다.
root가 승인된 저장소 자격정보를 비공개 환경 파일로 공급하고 다음 조건을 명시해야 한다. 운영 비밀 파일을 자동 탐색하지 않는다.

```bash
# 외부의 비공개 환경 파일에 승인된 private HOST/TOKEN과 아래 확인 플래그를 넣는다.
# 연결 문자열/토큰을 명령줄 인자나 공개 로그에 붙이지 않는다.
HRA_TEST_PG_BIN=/opt/homebrew/opt/postgresql@18/bin \
  node --env-file=/안전한/QA전용.env scripts/verify-academic-private-upload-http.mjs
```

`HRA_ACADEMIC_QA_PRIVATE_STORE_CONFIRMED=true`는 QA 전용 namespace·격리 원장 사용 권한을 확인하는 설정이다. 별도 물리 QA 저장소라는 뜻은 아니다. 스크립트는 합성 MEMBER의 정상 credentials 세션,
실제 앱 의도/SDK 토큰, SDK client PUT 50MiB, 익명 403, 덮어쓰기 차단, 서버 해시·VERIFIED/최종 제출 0건,
취소 및 실제 만료/유예 후 **이번 실행의 원장 한 개만** 정리함을 검사한다.
과제 마감을 실행 시점 5분 뒤로 만들어 정리까지 약 10분 기다리며 토큰 시계를 임의로 조작하지 않는다.
기본 callback 주소는 `.invalid`여서 실제 전달을 검증하지 못한다. 이 경우 callback 유실 후 명시 verify 복구 및 위조 서명 거부를 구분해 기록한다.
실제 callback 전달은 `HRA_ACADEMIC_QA_CALLBACK_URL`에 이 격리 앱으로 연결되는 전용 터널 URL을 제공한 별도 실행이 필요하다.
실패 시 재시도를 위한 원장(manifest)은 `/tmp`의 0600 파일에 저장하고 경로만 출력한다. 원문 URL·저장 키·파일명·토큰은 출력하지 않는다.
실패로 객체가 남으면 해당 manifest의 정확한 키와 만료 시각을 기준으로 승인된 복구 작업을 수행해야 한다.

**2026-10-16 통합 담당자 실전 결과:** 격리 PostgreSQL·실제 credentials 로그인과 승인된 private 저장소의 새 QA 경로로 위 실행기를 실행해 exit 0을 확인했다. SDK의 50MiB 직접 PUT, 익명 403, 같은 경로 덮어쓰기 거부, 서버 원본 SHA-256 일치, VERIFIED·최종 제출 0건, 실제 토큰 만료와 5분 유예 후 해당 원장 객체 한 개 삭제가 모두 통과했다. 운영 회원·DB·기존 파일은 사용하거나 변경하지 않았다.

확인한 전송 규모는 성공한 파일 쓰기 50MiB와 서버 검증 원본 읽기 50MiB이며, 메타 조회·덮어쓰기 거부·삭제 요청도 실행했다. 청구서와 계정 사용량은 조회하지 않았으므로 실제 청구 금액을 0원으로 단정하지 않는다. 운영 지역·요금제의 작업/저장/전송 단가는 위 공식 가격표와 계정 사용량으로 확인한다.

실제 callback 전달은 이번 로컬 실행에서 하지 않았다. callback 미전달 상태의 명시적 검증 복구는 실전 통과했고, 정상/위조 HMAC·키 순서·추가 속성·중복 callback은 실제 SDK를 사용하는 격리 회귀로 별도 검증했다.
