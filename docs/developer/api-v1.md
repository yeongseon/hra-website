# API v1 현재 제공 범위

공용 HTTP 계약의 정본은 [`packages/contracts/openapi.json`](../../packages/contracts/openapi.json)입니다. 이 파일은 OpenAPI 3.1.1 JSON 형식이며 **실제로 제공하는 경로만** 기록합니다. 현재 구현된 경로는 `GET /api/v1/notices`와 `GET /api/v1/me`입니다. 이후 일정, 자료, 과제·제출·파일 계약은 #272에서 추가합니다.

## 본인 프로필

`GET /api/v1/me`는 현재 Auth.js **Web 세션 쿠키**를 사용합니다. 세션이 없으면 401 `UNAUTHENTICATED`로 끝나고, Route 내부에서도 매 요청 세션을 확인합니다. 쿠키 이름은 배포 환경과 보안 접두어·분할에 따라 달라지므로 계약에 하나로 고정하지 않습니다. 모바일 Bearer·refresh 인증은 아직 구현되지 않았으며 #273의 별도 경계입니다.

세션 확인 뒤 현재 사용자의 표시용 행을 다시 조회합니다. 응답은 `{ user: { id, name, email, role, cohortId, imageUrl } }` 여섯 필드만 허용하며 비밀번호 해시·OAuth binding·세션 버전은 반환하지 않습니다. 내부 placeholder 이메일은 `null`입니다. `PENDING`도 **자기 프로필만** 읽을 수 있고 자료실·학사 인가는 이 API로 부여하지 않습니다. 사용자 행이 없어졌거나 세션의 역할과 다르면 401로 거부합니다.

이 경로는 query를 받지 않아 전달되면 400 `INVALID_INPUT`입니다. Auth.js가 오류를 명시적으로 전파하거나 세션 인증 이후 별도 프로필 조회가 실패하면 503 `UNAVAILABLE`을 반환합니다. Auth.js JWT 콜백의 DB 오류는 라이브러리가 세션을 지워 무세션 401로 끝날 수도 있으므로 모든 DB 오류를 503으로 분류한다고 주장하지 않습니다. 모든 응답은 `Cache-Control: private, no-store`이며 오류에도 개인 정보·SQL 원문을 포함하지 않습니다.

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
