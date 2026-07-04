/**
 * 서버 에러 sanitize·로깅 유틸 (#70)
 *
 * 배경:
 *   Drizzle NeonHttpError.message 는 실패한 SQL query text 를 그대로 포함한다.
 *   INSERT/UPDATE 실패 시 email·name·phone 등 PII 가 Vercel Logs 로 유출되어
 *   PIPA §29 (개인정보 최소 수집·이용) 위반 소지가 있다. 로그 시스템 접근 권한을
 *   가진 개발자·운영자가 대량 PII 를 조회할 수 있게 된다.
 *
 * 사용 원칙:
 *   1. server-side 경로에서만 사용한다 (server actions, API routes, middleware,
 *      server components). 여기서 발생한 로그는 Vercel Logs 로 전송된다.
 *   2. client 컴포넌트("use client") 의 console.error 는 브라우저 콘솔에만 남으므로
 *      본 헬퍼로 감쌀 필요가 없다.
 *   3. 사용자에게 반환하는 메시지는 이 헬퍼 결과가 아닌, 별도의 사용자 친화 문자열을
 *      사용한다 (예: "저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.").
 *   4. context 에 넘기는 값은 UUID·enum·count 등 명시적으로 안전한 식별자만 허용한다.
 *      URL·filename·slug 는 원본 파일명(사용자 지정)을 포함할 수 있어 raw 로 넘기지 말고
 *      redactBlobUrl 같은 sanitize helper 를 반드시 거쳐야 한다.
 *
 * 참고 (기존 exemplar):
 *   - `src/features/applications/actions/submissions.ts:414-436, 527-546` 는 audit
 *     로그의 식별자 최소화 패턴 (#56) 을 확립했으나 `error` 필드 자체는 raw 였다.
 *     본 helper 로 통일한다.
 */

// ── redact 패턴 ─────────────────────────────────────────────────────────────

// SQL DML/DDL 키워드 + 실제 SQL 구조 마커 (`(`, VALUES, SET, FROM 등) 가 따라올 때만 매칭.
//   - 자연어 오탐 방지: "Cannot update headers after they are sent" (UPDATE 뒤에 SET 없음),
//     "Please select a valid option" (SELECT 뒤에 FROM 없음),
//     "Please insert into the form" (INSERT INTO 뒤에 (/VALUES/SELECT/DEFAULT 없음),
//     "with regard to X" (WITH 뒤에 AS( 없음) 등이 모두 매칭되지 않도록 좁혔다.
//   - Drizzle/Neon SQL 은 항상 파라미터 마커 `$1` 또는 quoted identifier `"table"` 를 포함하는
//     구조적 형태이므로 (INSERT INTO x (, UPDATE x SET, DELETE FROM x, SELECT ... FROM x 등)
//     이 구조에만 반응한다.
//   - [\s\S]* 로 SQL 이후를 전부 삼기는 이유: SQL 뒤에는 대개 파라미터 값(email 등 PII)이
//     따라오므로 SQL 감지 즉시 문장 끝까지 잘라내는 게 안전하다.
//   - i 플래그 유지: Drizzle 은 대소문자 혼용을 낼 수 있고, SQL-structure 앵커가 이미
//     자연어를 걸러주므로 false positive 위험은 낮다.
//   - "Cannot delete from cache" 같은 극단적 자연어 문장은 여전히 오탐 가능하나 (DELETE FROM ident),
//     비-SQL 컨텍스트에서 "delete from <명사>" 는 실무 로그에 드물어 트레이드오프상 수용한다.
const SQL_KEYWORD_PATTERN =
  /\b(?:INSERT\s+INTO\s+(?:"[^"]+"|[a-zA-Z_][\w$]*)\s*(?:\(|VALUES|SELECT|DEFAULT)|UPDATE\s+(?:"[^"]+"|[a-zA-Z_][\w$]*)\s+SET|DELETE\s+FROM\s+(?:"[^"]+"|[a-zA-Z_][\w$]*)|SELECT\s+[\s\S]+?\s+FROM\s+(?:"[^"]+"|[a-zA-Z_][\w$]*)|MERGE\s+INTO\s+(?:"[^"]+"|[a-zA-Z_][\w$]*)|UPSERT\s+INTO\s+(?:"[^"]+"|[a-zA-Z_][\w$]*)|CREATE\s+(?:TABLE|INDEX|UNIQUE|VIEW|SCHEMA)(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:"[^"]+"|[a-zA-Z_][\w$]*)|ALTER\s+(?:TABLE|INDEX)\s+(?:"[^"]+"|[a-zA-Z_][\w$]*)|DROP\s+(?:TABLE|INDEX|VIEW|SCHEMA)(?:\s+IF\s+EXISTS)?\s+(?:"[^"]+"|[a-zA-Z_][\w$]*)|TRUNCATE\s+(?:TABLE\s+)?(?:"[^"]+"|[a-zA-Z_][\w$]*)|WITH\s+["\w]+\s+AS\s*\(|COPY\s+["\w]+\s+(?:FROM|TO))\b[\s\S]*/gi;

// Postgres 연결 문자열 (postgres://user:pass@host/db 또는 postgresql://...) 마스킹.
// DB 비밀번호·호스트명 등 인프라 노출 방지.
const CONNECTION_STRING_PATTERN = /\bpostgres(?:ql)?:\/\/[^\s'"]+/gi;

// Postgres 유니크 제약 위반 상세: "Key (email)=(user@example.com) already exists".
// 컬럼명은 디버깅에 필요하므로 유지, 값만 [value redacted] 로 치환.
const PG_KEY_VALUE_PATTERN = /Key\s*\(([^)]+)\)\s*=\s*\([^)]*\)/gi;

// Postgres parameter dump: "$1 = 'value'" 형태로 파라미터가 실패 컨텍스트에 노출될 수 있다.
// 대표 예시:
//   - "CONTEXT: unnamed portal parameter $1 = 'user@example.com'"
//   - "parameters: $1 = '홍길동', $2 = '010-1234-5678'"
// Postgres 는 값 안의 ' 를 '' 로 escape 하므로 quoted alt 는 (?:[^']|'')* 로 다룬다.
// unquoted alt 는 NULL/숫자/bool 등을 콤마·개행·)전까지 소비한다.
// 치환: `$1 = '[value redacted]'` 대신 그냥 `$1 = [value redacted]` 로 통일하여 quoted/unquoted 구분 없앤다.
const PG_PARAMETER_DUMP_PATTERN = /(\$\d+\s*=\s*)(?:'(?:[^']|'')*'|[^,\n\r)]*)/gi;

// 절대 파일 경로 (스택 트레이스에 자주 등장) → 서버 내부 디렉토리 구조 노출 방지.
// 대표적 접두어: /Users(macOS), /home(Linux), /var, /opt, /app(Docker), /root, /mnt, /srv
const ABSOLUTE_PATH_PATTERN = /\/(?:Users|home|var|opt|app|root|mnt|srv)\/[^\s'":,)]+/gi;

// 로그 flooding 방지용 방어적 길이 제한.
const MAX_MESSAGE_LENGTH = 500;

/**
 * Postgres composite 출력 (`Failing row contains (...)`) 을 안전하게 마스킹한다.
 *
 * 왜 regex 가 아니라 parser 인가:
 *   단순 regex `/\([^)]*\)/` 는 첫 `)` 에서 멈추므로, 컬럼값이 `"홍길동 (대표)"` 처럼
 *   따옴표로 감싼 문자열 안에 `)` 를 포함할 때 매치가 조기 종료되어 뒤쪽 PII 가 그대로 남는다.
 *   (Oracle Phase A v2 리뷰 지적사항.)
 *
 * Postgres composite 필드 escape 규칙:
 *   - 필드는 `,` 로 구분되며 `(...)` 로 감싸진다.
 *   - 값 안에 `,` / `"` / `(` / `)` / 공백 / 빈값 등이 있으면 `"..."` 로 감싼다.
 *   - 감싼 값 안의 `"` 는 `""` 로 escape 된다.
 *   - 숫자·bool·NULL 은 unquoted.
 *
 * 알고리즘:
 *   `Failing row contains (` 를 찾은 뒤 문자 단위로 스캔하며 (a) 따옴표 내부인지,
 *   (b) `""` escape 인지, (c) 실제 괄호 depth 를 추적. depth 가 0 이 되는 순간이 진짜 close paren.
 *   매칭 실패 시 문자열 끝까지를 모두 redact (fail-safe — PII 노출보다 과잉 redact 가 낫다).
 */
function redactFailingRow(input: string): string {
  const marker = "Failing row contains (";
  const replacement = "Failing row contains ([values redacted])";
  const parts: string[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    const idx = input.indexOf(marker, cursor);
    if (idx === -1) {
      parts.push(input.slice(cursor));
      break;
    }

    // marker 앞의 원본 텍스트는 보존
    parts.push(input.slice(cursor, idx));

    // opening paren 다음부터 스캔 (marker 끝에 `(` 포함되므로 length-1 이 여는 괄호 위치)
    let i = idx + marker.length;
    let inQuoted = false;
    let parenDepth = 1;

    while (i < input.length && parenDepth > 0) {
      const ch = input[i];
      if (inQuoted) {
        // Postgres composite 는 따옴표를 `""` 로 escape → 두 문자를 함께 건너뜀
        if (ch === '"' && input[i + 1] === '"') {
          i += 2;
          continue;
        }
        if (ch === '"') {
          inQuoted = false;
        }
      } else {
        if (ch === '"') {
          inQuoted = true;
        } else if (ch === "(") {
          parenDepth++;
        } else if (ch === ")") {
          parenDepth--;
          if (parenDepth === 0) {
            i++;
            break;
          }
        }
      }
      i++;
    }

    parts.push(replacement);
    cursor = i;
  }

  return parts.join("");
}

/** 로그에 안전하게 남길 수 있는 필드만 골라낸 error 요약. */
export interface SanitizedError {
  name: string;
  message: string;
  code?: string;
}

// ── redactMessage / sanitizeError ───────────────────────────────────────────

/**
 * 문자열에서 PII/인프라 노출 위험 부분을 순차적으로 제거한다.
 *
 * 처리 순서 (앞선 규칙이 뒤 규칙의 소재를 없앨 수 있어 순서 중요):
 *   1. SQL DML/DDL + 구조 → `[SQL redacted]`
 *   2. postgres:// 연결 문자열 → `[connection string redacted]`
 *   3. `Key (col)=(value)` → `Key (col)=([value redacted])`
 *   4. `Failing row contains (...)` → `Failing row contains ([values redacted])` (parser 기반)
 *   5. `$N = 'value'` (Postgres parameter dump) → `$N = [value redacted]`
 *   6. 절대 경로 → `[path redacted]`
 *   7. MAX_MESSAGE_LENGTH 초과분 절단
 *
 * 절단(slice) 이 replace 뒤에 오는 이유: 원본이 매우 긴 경우에도 앞부분에서 SQL 이
 * 짤린 채 잔여 PII 가 남지 않도록 먼저 redact 하고 나서 자른다.
 */
export function redactMessage(input: string): string {
  let out = input.replace(SQL_KEYWORD_PATTERN, "[SQL redacted]");
  out = out.replace(CONNECTION_STRING_PATTERN, "[connection string redacted]");
  out = out.replace(PG_KEY_VALUE_PATTERN, "Key ($1)=([value redacted])");
  out = redactFailingRow(out);
  out = out.replace(PG_PARAMETER_DUMP_PATTERN, "$1[value redacted]");
  out = out.replace(ABSOLUTE_PATH_PATTERN, "[path redacted]");
  return out.slice(0, MAX_MESSAGE_LENGTH);
}

/**
 * object 의 property 를 예외 안전하게 읽는다.
 * getter 가 throw 하는 병리적 error 서브클래스에서도 sanitizeError 가 깨지지 않도록 방어.
 * 로깅 유틸이 throw 하면 원본 에러가 사라지고 서버 액션이 500 으로 죽으므로 반드시 non-throw.
 */
function readSafeProperty(obj: object, key: string): unknown {
  try {
    return (obj as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

/**
 * 값을 예외 안전하게 문자열로 변환한다.
 * `String(value)` 는 value.toString() 이 throw 할 경우 함께 throw 하므로 방어한다.
 */
function safeStringify(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "[unstringifiable]";
  }
}

/**
 * error 객체에서 로그로 안전한 필드만 추출한다.
 *
 * 반환 필드:
 *   - name: Error 서브클래스 이름 (예: "NeonHttpError", "ZodError")
 *   - message: redactMessage 로 sanitize 된 메시지
 *   - code: 문자열 형태의 error code (Postgres error code: "23505" 등). PII 없음.
 *
 * 의도적으로 제외한 필드:
 *   - stack: 절대 경로·SQL 이 섞여 있어 sanitize 비용 대비 실익이 낮다.
 *     로컬 디버깅에서는 개별 console.error 로 직접 확인.
 *   - cause: 재귀 sanitize 필요하여 복잡도 상승. 현 사용 사례에서는 불필요.
 *
 * 예외 안전성:
 *   본 함수는 어떤 입력에도 절대 throw 하지 않는다. 병리적 error 서브클래스
 *   (throwing getter, toString 실패 등) 에서도 최소한 `[sanitize failed]` 라도
 *   반환한다. 로깅 유틸이 죽으면 원본 에러 정보가 함께 사라져 debug 가 불가능해진다.
 */
export function sanitizeError(error: unknown): SanitizedError {
  try {
    if (error instanceof Error) {
      const rawName = readSafeProperty(error, "name");
      const rawMessage = readSafeProperty(error, "message");
      const rawCode = readSafeProperty(error, "code");

      const errorName = typeof rawName === "string" ? rawName : "Error";
      const messageStr =
        typeof rawMessage === "string" ? rawMessage : safeStringify(rawMessage ?? "");
      const errorCode = typeof rawCode === "string" ? rawCode : undefined;

      return {
        name: errorName,
        message: redactMessage(messageStr),
        code: errorCode,
      };
    }

    // Error 가 아닌 값이 throw 된 경우 (문자열·객체·undefined 등).
    return {
      name: "UnknownError",
      message: redactMessage(safeStringify(error)),
    };
  } catch {
    // redactMessage 조차 실패 (예: 정규식 엔진 이상) — 로깅은 계속되어야 한다.
    return {
      name: "SanitizerError",
      message: "[sanitize failed]",
    };
  }
}

// ── Blob URL sanitize ───────────────────────────────────────────────────────

/**
 * Blob URL 에서 사용자 지정 파일명을 제거하고 hostname + 첫 path segment 만 남긴다.
 *
 * 배경:
 *   Vercel Blob 업로드 시 파일명은 `${timestamp}-${file.name}` 형태로 URL path 에 그대로
 *   포함된다 (`src/features/alumni/actions/index.ts:91-96` 등). 원본 file.name 은 사용자·
 *   관리자가 임의로 지정하므로 "홍길동-프로필.jpg", "01012345678.png", "user@example.com.png"
 *   같은 PII 를 자주 담는다. 따라서 raw URL 을 로그 context 로 넘기면 PII 재유출이 발생한다.
 *
 * 반환 예시:
 *   input:  https://xyz.public.blob.vercel-storage.com/alumni/1234567890-홍길동.jpg
 *   output: xyz.public.blob.vercel-storage.com/alumni/[filename redacted]
 *
 * 첫 path segment (예: "alumni", "gallery") 는 코드 상수이므로 안전하고,
 * "어느 feature 의 Blob 삭제가 실패하는가" 를 debug 하는 데 충분한 힌트가 된다.
 */
export function redactBlobUrl(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
      return u.host;
    }
    return `${u.host}/${segments[0]}/[filename redacted]`;
  } catch {
    return "[invalid url]";
  }
}

// ── logServerError ──────────────────────────────────────────────────────────

/**
 * 서버 로그 통일 포맷.
 *
 * @param scope - 로그 태그. `domain/action` 형태의 kebab-case 권장 (예: "class-materials/create").
 * @param error - 원본 error 객체. 내부에서 sanitizeError 로 변환된 뒤 로그된다.
 * @param context - 안전한 식별자만 포함하는 객체. UUID·enum·count·boolean 만 허용.
 *   **이름·이메일·전화번호·주소·raw URL·raw filename 등 PII 는 절대 넣지 말 것.**
 *   Blob URL 은 반드시 `redactBlobUrl(url)` 로 감싸서 넘긴다.
 *
 * 출력 예시:
 *   [class-materials/create] {
 *     context: { id: "uuid...", action: "create" },
 *     error: { name: "NeonHttpError", message: "[SQL redacted]", code: "23505" }
 *   }
 */
export function logServerError(
  scope: string,
  error: unknown,
  context?: Record<string, string | number | boolean | null>,
): void {
  console.error(`[${scope}]`, {
    ...(context ? { context } : {}),
    error: sanitizeError(error),
  });
}
