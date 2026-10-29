# API v1 현재 제공 범위

공용 HTTP 계약의 정본은 [`packages/contracts/openapi.json`](../../packages/contracts/openapi.json)입니다. 이 파일은 OpenAPI 3.1.1 JSON 형식이며 **실제로 제공하는 경로만** 기록합니다. 기존 공지·본인 프로필·공개 일정·가이드북 목록과 아래 학사 MVP 경로를 제공합니다. 나머지 자료 유형과 모바일 인증은 각각 후속 확장 및 #273 범위입니다.

## 본인 프로필

`GET /api/v1/me`는 현재 Auth.js **Web 세션 쿠키**를 사용합니다. 세션이 없으면 401 `UNAUTHENTICATED`로 끝나고, Route 내부에서도 매 요청 세션을 확인합니다. 쿠키 이름은 배포 환경과 보안 접두어·분할에 따라 달라지므로 계약에 하나로 고정하지 않습니다. 모바일 Bearer·refresh 인증은 아직 구현되지 않았으며 #273의 별도 경계입니다.

세션 확인 뒤 현재 사용자의 표시용 행을 다시 조회합니다. 응답은 `{ user: { id, name, email, role, cohortId, imageUrl } }` 여섯 필드만 허용하며 비밀번호 해시·OAuth binding·세션 버전은 반환하지 않습니다. 내부 placeholder 이메일은 `null`입니다. `PENDING`도 **자기 프로필만** 읽을 수 있고 자료실·학사 인가는 이 API로 부여하지 않습니다. 사용자 행이 없어졌거나 세션의 역할과 다르면 401로 거부합니다.

이 경로는 query를 받지 않아 전달되면 400 `INVALID_INPUT`입니다. Auth.js가 오류를 명시적으로 전파하거나 세션 인증 이후 별도 프로필 조회가 실패하면 503 `UNAVAILABLE`을 반환합니다. Auth.js JWT 콜백의 DB 오류는 라이브러리가 세션을 지워 무세션 401로 끝날 수도 있으므로 모든 DB 오류를 503으로 분류한다고 주장하지 않습니다. 모든 응답은 `Cache-Control: private, no-store`이며 오류에도 개인 정보·SQL 원문을 포함하지 않습니다.

## 공개 일정

`GET /api/v1/schedule`은 `year`(1900~2100)와 `month`(1~12)를 모두 요구합니다. 중복·미등록 query와 범위 밖 값은 400 `INVALID_INPUT`, 일정 저장소 장애는 503 `UNAVAILABLE`로 처리합니다. Web 캘린더의 잘못된 연·월을 현재 달로 보정하는 규칙과 달리 API 입력은 엄격히 거부합니다. 공개 표시된 일정만 한 달 범위로 조회하며 응답은 `{ year, month, timeZone: "Asia/Seoul", events }`입니다.

각 이벤트의 `calendarDate`는 `YYYY-MM-DD`, `startTime`과 선택적 `endTime`은 한국 벽시계 `HH:MM`입니다. `endTime`만으로 종료 날짜·자정 넘김·지속 시간을 추정하지 않습니다. `event_date`는 PostgreSQL의 **시간대 없는 timestamp**에 한국 달력의 벽시계 필드를 저장하므로 실제 UTC 순간으로 해석하거나 9시간을 더하지 않습니다. 예를 들어 한국 시각 10월 31일 23:30 수업은 API에서 그대로 `calendarDate: "2026-10-31"`, `startTime: "23:30"`입니다. Web 달력의 기존 ISO 직렬화는 Web 표시 규칙으로 유지하며 API에는 `eventDate` ISO를 내보내지 않습니다. [PostgreSQL 시간 타입 설명](https://www.postgresql.org/docs/current/datatype-datetime.html)에 따르면 시간대 없는 timestamp는 입력의 시간대 표시를 조정 값으로 보관하지 않습니다.

이벤트·세션에는 제목/내용·순서와 공개 기수/교수의 ID·이름만 들어갑니다. 기수 시트 주소·폼 URL과 교수 내부 열은 조회·응답에서 제외합니다. 이 공개 GET은 캐시하지 않으며 관리자 일정 쓰기나 개인 출결 인가와 관계없습니다.

## 공개 공지 목록

| Query | 기본값 | 범위·처리 |
| --- | --- | --- |
| `page` | `1` | 1부터 시작하는 정수 |
| `pageSize` | `10` | 1~50 정수 |
| `q` | 없음 | 앞뒤 공백 제거 후 제목 검색, 최대 100자, 대소문자 무시 |

알 수 없는 query key와 중복 key, 안전한 정수 범위를 넘는 페이지 offset은 400 `INVALID_INPUT`으로 거부합니다. API의 범위 밖 `page`는 **요청한 페이지 번호**와 빈 `notices` 목록을 반환합니다. Web `/notices` 화면은 마지막 페이지로 보정하므로 두 입력 정책을 혼동하지 않습니다.

성공 응답은 `{ notices, page }`입니다. 공지 항목에는 `id`, `title`, Markdown을 평문으로 줄인 `excerpt`, `pinned`, `viewCount`, `createdAt`, `updatedAt`만 들어갑니다. 본문 원문·작성자 ID·초안 상태는 반환하지 않습니다. 시각은 UTC 밀리초 ISO 문자열이고 한국 시간대 표시는 클라이언트가 결정합니다.

입력 오류는 400 `INVALID_INPUT`, DB 등 제공 불가 오류는 503 `UNAVAILABLE`입니다. 오류 본문은 `{ error: { code, message, requestId } }`만 담고 SQL·검색어·내부 오류 원문은 보내지 않습니다. 이 공개 GET은 응답 캐시를 사용하지 않으며 현재 Web 화면과 같은 공지 서비스·게시 정책을 호출합니다. Web 서버가 자기 API로 HTTP 요청을 보내지는 않습니다.

OpenAPI의 JSON 표현은 [OpenAPI 3.1.1 명세](https://spec.openapis.org/oas/v3.1.1.html)의 문서 형식에 따릅니다.

## 공개 공지 상세

`GET /api/v1/notices/{id}`는 UUID 경로 ID가 가리키는 **게시된 공지**만 반환합니다. 성공 응답은 `{ notice: { id, title, content, viewCount, createdAt } }`로 고정합니다. `content`는 공개 Markdown 원문이고 `createdAt`은 UTC 밀리초 ISO 문자열입니다. 내부 작성자 ID, 게시 상태, 이전·다음글, 그 밖의 DB 열은 API 응답에 포함하지 않습니다. Web 상세 화면은 같은 서비스에서 이전·다음글을 받아 표시합니다.

형식이 틀린 ID나 미지원 query는 400 `INVALID_INPUT`, 없는 공지·초안은 404 `NOT_FOUND`, 조회 저장소 장애는 503 `UNAVAILABLE`입니다. 모든 응답은 `Cache-Control: no-store`이며 오류 원문·SQL을 노출하지 않습니다. 성공 응답을 보낸 뒤 `after()` 수명주기에서 조회수를 원자적으로 1 증가시키므로 응답의 `viewCount`는 갱신 전 값일 수 있습니다. 요청당 갱신이며 방문자 중복 제거나 정확히 한 번 집계는 보장하지 않습니다.

## 승인 회원 가이드북 목록

`GET /api/v1/resources/guidebooks`는 현재 Auth.js Web 세션으로 승인된 `ADMIN`, `FACULTY`, `MEMBER`에게 가이드북 **메타데이터만** 제공합니다. Route 안에서 세션을 확인하고 Application Service가 현재 계정 행과 역할을 다시 대조합니다. 익명·삭제 또는 역할이 바뀐 계정은 401 `UNAUTHENTICATED`, 현재 승인 대기 계정은 403 `FORBIDDEN`입니다. Auth.js가 DB 오류를 무세션으로 바꾸는 경우는 `/api/v1/me`와 동일하게 401이 될 수 있습니다.

`page`(기본 1)와 `pageSize`(기본 10, 최대 50)만 받으며 중복·미등록 key와 PostgreSQL offset 범위 밖 값은 400 `INVALID_INPUT`으로 거부합니다. 범위 밖 페이지는 요청 번호를 유지한 빈 `guidebooks` 배열과 공통 `page` 메타를 반환합니다. 목록은 작성 시각·ID 역순으로 안정 정렬합니다. 각 항목은 `id`·`title` 두 필드뿐이고 원본 파일 URL·파일명·Blob 토큰·시간대 없는 `createdAt`은 보내지 않습니다. 실제 파일은 기존 인증 다운로드 경로에서만 서버가 읽습니다. 모든 응답은 `Cache-Control: private, no-store`와 `Vary: Cookie`이며 저장소 장애는 원문 없는 503 `UNAVAILABLE`입니다.

`/resources` 화면은 별도 통합 목록 Application Service를 사용하며 기수·다른 자료 유형과 기존 전체 정렬을 유지합니다. 가이드북 API는 페이지 조회에 필요한 최소 메타데이터만 제공하므로 화면의 통합 목록을 HTTP로 재호출하지 않습니다.

## 본인 과제·제출·파일 MVP

모든 학사 경로는 기존 Auth.js **Web 세션 쿠키**를 사용합니다. 모바일 Bearer·refresh 인증은 #273에서 구현하며, 이 API 추가가 모바일 로그인이나 학사 운영 활성화를 뜻하지 않습니다. 기존 `ACADEMIC_ENABLED`·쓰기/업로드 gate와 현재 학적·과제 대상·개인 파일 인가를 그대로 적용합니다. 일반 `ADMIN`·`FACULTY` 역할에 학생 과제 권한을 추가하지 않습니다.

| 메서드·경로 | 제공하는 결과 |
| --- | --- |
| `GET /api/v1/assignments` | 본인 공개 과제 목록과 다음 페이지 여부 |
| `GET /api/v1/assignments/{id}` | 본인 과제 지침·최종 제출·PDF 메타 |
| `GET /api/v1/assignments/{id}/submission` | 해당 과제의 본인 최종 제출·PDF 메타만 조회 |
| `POST /api/v1/submissions` | 비공개 PDF 검증 후 제출 확정 또는 같은 키의 성공 복구 |
| `POST /api/v1/uploads/intents` | PDF 업로드 발급 ID·불투명 경로·만료 시각 |
| `DELETE /api/v1/uploads/intents/{id}` | 본인 업로드 원장 취소 |
| `POST /api/v1/uploads/{id}/verify` | 실제 비공개 원본 PDF 검증 |
| `POST /api/v1/uploads` | Vercel SDK 토큰·서명된 완료 영수증 교환 |
| `GET /api/v1/submissions/{id}/files/{fileId}` | 현재 인가·감사를 통과한 개인 파일 첨부 스트림 |

과제 목록은 `page`(기본 1, 최대 10,000)·`pageSize`(기본 20, 최대 50)만 받습니다. 중복·미등록 query는 400이고 범위를 넘으면 요청 번호와 빈 배열을 반환합니다. 응답은 `{ assignments, page: { page, pageSize, hasNextPage } }`입니다. 기존 학생 서비스는 다음 페이지 존재만 조회하므로 공지의 `PageMeta`와 달리 추정 `totalCount`·`totalPages`를 추가하지 않습니다. 상세·파일 및 모든 변경 경로는 query를 받지 않습니다. 시각은 UTC 밀리초 ISO 문자열이며 KST 표시 변환은 클라이언트 책임입니다.

과제 DTO에는 과제/대상 식별자·제목·게시 상태·마감/게시 시각과 본인 최종 제출 식별자/시각만 포함합니다. 상세에만 지침과 PDF 파일 식별자·원본명·MIME·크기를 추가합니다. 다른 학생·계정·학적 식별자·Blob URL·저장 토큰은 반환하지 않습니다. 제출 전에는 `submission`과 `file`이 `null`이며 업로드 원장의 중간 상태는 최종 제출로 표시하지 않습니다.

제출 POST 입력은 `{ assignmentId, uploadIntentId, submissionKey }` 세 UUID만 허용합니다. 최초 제출과 같은 `submissionKey`의 성공 복구는 모두 HTTP 200이며 `{ submission: { assignmentId, submissionId, submittedAt, replayed, file } }`에서 `replayed`로 구분합니다. 원자 SQL·쓰기 gate·실제 파일 검증·검증 후 재인가는 기존 서비스가 담당하며 Web Server Action과 API가 같은 서비스를 호출합니다.

업로드 발급 입력은 `{ assignmentId, requestId, originalName, sizeBytes, mimeType }`입니다. 앞뒤 공백을 제거한 PDF 파일명(최대 255자), 빈 파일 제외, 50MiB 이하, `application/pdf`만 허용합니다. 발급 결과의 `pathname`은 `academic-uploads/v1/{uploadIntentId}/document.pdf`와 일치하는 불투명 SDK 전송 값이며 공개 다운로드 URL이나 권한 증명이 아닙니다. 검증·취소 JSON은 `{ assignmentId }`만 받고 업로드 ID는 경로에서 결합합니다. `VERIFIED`는 파일 검증 완료이며 제출 확정은 별도 POST입니다. `CANCELLED`는 발급 원장 종료이며 유효한 토큰이 남은 객체를 즉시 삭제하지 않습니다.

변경 요청은 동일 출처 `Origin`·`application/json`과 실제 16KiB 본문 상한을 요구합니다. `POST /uploads`는 **SDK 서명이 확인된 `blob.upload-completed` callback에만** Origin·사용자 세션 예외가 있습니다. 클라이언트 토큰 생성은 기존 Origin·현재 MEMBER 대상·발급 소유권·정확한 pathname·단일 PUT·요청 예산을 모두 확인합니다. 토큰 프로토콜의 Origin 거부는 기존 서비스의 불투명 404 `NOT_FOUND`를 유지하며, 나머지 변경 경로의 Origin 거부는 403 `FORBIDDEN`입니다. 서명용 JSON은 추가 속성과 원본 키 순서를 보존해 SDK에 전달합니다. 성공은 SDK의 `{ type: "blob.generate-client-token", clientToken }` 또는 `{ type: "blob.upload-completed", response: "ok" }` 그대로입니다. callback은 원장 수신을 멱등 기록할 뿐 검증·최종 제출 상태로 승격하지 않습니다.

오류는 기존 학사 Web 422/404 표현 대신 공통 v1 `{ error: { code, message, requestId, retryAfterSeconds? } }`를 사용합니다. 입력 400 `INVALID_INPUT`, 인증 401 `UNAUTHENTICATED`, 역할·Origin 403 `FORBIDDEN`, 없는/다른 대상·잘못된 경로 UUID 404 `NOT_FOUND`, 마감·만료·검증 대기·동시 변경 409 `CONFLICT`, JSON 크기 413 `TOO_LARGE`, 요청 예산 429 `RATE_LIMITED`, 기능 비활성 503 `DISABLED`, 업로드 저장소 실패 503 `STORAGE_UNAVAILABLE`, 기타 제공 불가 503 `UNAVAILABLE`로 매핑합니다. 요청 한도 응답은 `Retry-After`와 같은 `retryAfterSeconds`를 제공합니다. 오류 원문·SQL·파일 URL·토큰은 반환하지 않습니다.

모든 학사 응답은 `Cache-Control: private, no-store`, `Vary: Cookie`, 요청 참조 헤더를 사용합니다. 개인 파일은 현재 소유권 또는 지정 학사 책임자 권한과 감사가 확정된 뒤에만 읽으며, 파일 성공 응답에는 `application/octet-stream`·안전한 `attachment` 파일명·`nosniff`·sandbox CSP·검증된 크기를 유지합니다. 응답 시작 이후의 스트림 오류는 JSON으로 바꿀 수 없으므로 전송을 중단하고 내부 정보 없는 감사 이벤트를 기록합니다. 실제 운영 OAuth·Private Blob 이행·모바일 인증 완료를 이 합성/격리 검증으로 대신하지 않습니다.

`npm run test:academic-g1`은 기존 Web 여정과 함께 위 9경로를 실제 production 앱·정상 로그인·격리 PostgreSQL·로컬 private 저장소로 검증합니다. 업로드 취소/재발급·SDK 전송·검증·최종 제출·같은 키 복구·파일 해시/보안 헤더, 역할·기수·학적/세션 철회 및 테이블 설치 전 기능 비활성을 확인합니다.

## 계약 변경 검사

`node scripts/check-openapi-compat.mjs --self`는 현재 OpenAPI의 로컬 참조와 실제 `/api/v1` Route 경로를 읽기 전용으로 대조합니다. PR에서는 base commit, `main` push에서는 직전 commit의 OpenAPI와 비교해 **기존 path와 component를 정확히 보존하고 새 항목만 추가**하도록 필수 CI에서 검사합니다. 동적 `[id]` Route는 OpenAPI `{id}` 경로에 대응하며 catch-all·Route Group 아래의 `/api/v1` 등 아직 지원하지 않는 배치는 조용히 무시하지 않고 검사 실패로 남깁니다.

이 정책은 보수적이어서 기존 설명 문구만 고쳐도 차단합니다. 의도된 계약 수정·삭제는 별도 버전/전환 방안을 검토해야 합니다. 이 검사는 실제 HTTP 동작이나 모든 JSON Schema 호환성을 완전하게 판정하지 않으며, PR이 검사 코드 자체를 변경하는 적대적 우회까지 막는 승인 장치가 아닙니다.
