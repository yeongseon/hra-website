# API v1 현재 제공 범위

공용 HTTP 계약의 정본은 [`packages/contracts/openapi.json`](../../packages/contracts/openapi.json)입니다. 이 파일은 OpenAPI 3.1.1 JSON 형식이며 **실제로 제공하는 경로만** 기록합니다. 현재 구현된 경로는 `GET /api/v1/notices`, `GET /api/v1/me`, `GET /api/v1/schedule`입니다. 이후 자료, 과제·제출·파일 계약은 #272에서 추가합니다.

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

## 계약 변경 검사

`node scripts/check-openapi-compat.mjs --self`는 현재 OpenAPI의 로컬 참조와 실제 `/api/v1` Route 경로를 읽기 전용으로 대조합니다. PR에서는 base commit, `main` push에서는 직전 commit의 OpenAPI와 비교해 **기존 path와 component를 정확히 보존하고 새 항목만 추가**하도록 필수 CI에서 검사합니다. 동적 `[id]` Route는 OpenAPI `{id}` 경로에 대응하며 catch-all·Route Group 아래의 `/api/v1` 등 아직 지원하지 않는 배치는 조용히 무시하지 않고 검사 실패로 남깁니다.

이 정책은 보수적이어서 기존 설명 문구만 고쳐도 차단합니다. 의도된 계약 수정·삭제는 별도 버전/전환 방안을 검토해야 합니다. 이 검사는 실제 HTTP 동작이나 모든 JSON Schema 호환성을 완전하게 판정하지 않으며, PR이 검사 코드 자체를 변경하는 적대적 우회까지 막는 승인 장치가 아닙니다.
