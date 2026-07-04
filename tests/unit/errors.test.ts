/**
 * 서버 에러 sanitize·로깅 단위 테스트 (이슈 #70)
 *
 * 검증 대상:
 *   - redactMessage: SQL / 연결 문자열 / Postgres Key(col)=(value) / 절대 경로 / 길이 제한
 *   - redactMessage 회귀 (v1): PG_FAILING_ROW 기본 케이스 (Oracle BLOCK #1),
 *     SQL false positive 방지 (Oracle NIT #3)
 *   - redactMessage 회귀 (v2): redactFailingRow parser 심층 (Oracle v2 BLOCK #1) —
 *     따옴표 내부 `)`, `""` escape, 중첩 괄호, 미종결 케이스
 *   - redactMessage 회귀 (v2): PG_PARAMETER_DUMP_PATTERN (Oracle v2 BLOCK #2) —
 *     `$N = 'value'` 형태의 Postgres parameter dump 마스킹
 *   - sanitizeError: Error·비Error·Postgres code 처리
 *   - sanitizeError 회귀: throw-safety — getter/toString 이 throw 해도 sanitize 는 죽지 않음 (Oracle NIT #4)
 *   - redactBlobUrl: Vercel Blob URL 에서 사용자 지정 파일명(PII) 제거 (Oracle BLOCK #2)
 *   - logServerError: 콘솔 포맷 및 context 병합, sanitize 통과
 *   - 통합: blob-utils 사용 패턴 (redactBlobUrl → logServerError context) 재현
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { logServerError, redactBlobUrl, redactMessage, sanitizeError } from "@/lib/errors";

describe("redactMessage", () => {
  it("INSERT SQL 이후 전체를 [SQL redacted] 로 치환한다 (PII 제거 확인)", () => {
    const input = `duplicate key value violates unique constraint "applications_email_key"\nINSERT INTO applications (email, name) VALUES ('user@example.com', '홍길동') RETURNING id`;
    const out = redactMessage(input);
    expect(out).toContain("[SQL redacted]");
    expect(out).not.toContain("user@example.com");
    expect(out).not.toContain("홍길동");
  });

  it("UPDATE SQL 을 제거해 컬럼값·조건 노출을 막는다", () => {
    const input = "syntax error at UPDATE users SET password_hash='xxx' WHERE email='foo@bar.com'";
    const out = redactMessage(input);
    expect(out).not.toContain("password_hash");
    expect(out).not.toContain("foo@bar.com");
  });

  it("SELECT WHERE 절의 값도 함께 제거한다", () => {
    const input = "connection failed during SELECT * FROM users WHERE ssn='123456-1234567'";
    const out = redactMessage(input);
    expect(out).not.toContain("ssn");
    expect(out).not.toContain("123456-1234567");
  });

  it("postgres:// 연결 문자열을 마스킹한다 (DB 비밀번호 유출 방지)", () => {
    const input = "connection refused: postgres://user:secret@ep-cool.us-east.neon.tech/db";
    const out = redactMessage(input);
    expect(out).toContain("[connection string redacted]");
    expect(out).not.toContain("secret");
    expect(out).not.toContain("ep-cool");
  });

  it("postgresql:// 프로토콜 변형도 마스킹한다", () => {
    const input = "postgresql://admin:pw@localhost/hra";
    const out = redactMessage(input);
    expect(out).toContain("[connection string redacted]");
    expect(out).not.toContain("admin:pw");
  });

  it("Postgres Key (col)=(value) 값을 마스킹하되 컬럼명은 유지한다", () => {
    const input = "duplicate key: Key (email)=(user@example.com) already exists.";
    const out = redactMessage(input);
    expect(out).toContain("Key (email)=([value redacted])");
    expect(out).not.toContain("user@example.com");
  });

  it("절대 파일 경로를 [path redacted] 로 치환한다 (서버 구조 노출 방지)", () => {
    const input = "at Object.<anonymous> (/Users/dev/hra-website/src/lib/db.ts:42:10)";
    const out = redactMessage(input);
    expect(out).toContain("[path redacted]");
    expect(out).not.toContain("/Users/dev");
  });

  it("메시지가 500자를 넘으면 500자로 자른다 (로그 flooding 방지)", () => {
    const input = "a".repeat(1000);
    const out = redactMessage(input);
    expect(out.length).toBe(500);
  });

  it("PII·SQL 이 없는 일반 메시지는 그대로 유지한다", () => {
    const input = "invalid input";
    const out = redactMessage(input);
    expect(out).toBe("invalid input");
  });

  it("대소문자 무관하게 SQL 키워드를 매치한다", () => {
    const input = "error: insert into users values ('x@y.com')";
    const out = redactMessage(input);
    expect(out).toContain("[SQL redacted]");
    expect(out).not.toContain("users");
    expect(out).not.toContain("x@y.com");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Oracle 리뷰 반영 회귀 테스트 (#70 Phase A BLOCK 대응)
// ────────────────────────────────────────────────────────────────────────────

describe("redactMessage - redactFailingRow parser (#70 Oracle BLOCK #1 + v2 parser)", () => {
  // Postgres 는 NOT NULL / CHECK 제약 위반 시 실제 row 전체를 detail 에 담아 리턴한다.
  // Drizzle 은 이를 그대로 error.message 에 실어서 전달하므로 sanitize 가 필수다.
  // parser 는 quoted 내부 `)`, `""` escape, 중첩 괄호, 미종결을 모두 다뤄야 하며
  // 아래 케이스들은 parser 의 각 상태 전이가 정확히 구현되었는지 검증한다.

  it("DETAIL: Failing row contains (...) 의 컬럼값을 모두 마스킹한다", () => {
    const input =
      'ERROR: null value in column "email" violates not-null constraint\nDETAIL: Failing row contains (a3f9b1c2-1234, user@example.com, 홍길동, 010-1234-5678, null).';
    const out = redactMessage(input);
    expect(out).toContain("Failing row contains ([values redacted])");
    expect(out).not.toContain("user@example.com");
    expect(out).not.toContain("홍길동");
    expect(out).not.toContain("010-1234-5678");
    expect(out).not.toContain("a3f9b1c2");
  });

  it("Failing row 문장이 여러 번 등장해도 모두 마스킹한다 (parser 반복 확인)", () => {
    const input =
      "Failing row contains (1, alice@x.com). Also: Failing row contains (2, bob@y.com).";
    const out = redactMessage(input);
    expect(out).not.toContain("alice@x.com");
    expect(out).not.toContain("bob@y.com");
    const matches = out.match(/Failing row contains \(\[values redacted\]\)/g);
    expect(matches?.length).toBe(2);
  });

  it("힌트 문구 'Failing row contains' 자체는 유지하여 debug 가치를 보존한다", () => {
    const input = "DETAIL: Failing row contains (uuid, name).";
    const out = redactMessage(input);
    expect(out).toContain("Failing row contains");
  });

  it("괄호 내부에 다양한 데이터 타입이 섞여도 통째로 마스킹한다 (숫자·null·따옴표·bool)", () => {
    const input =
      "Failing row contains (42, null, 'quoted string', true, 3.14, 'user@example.com').";
    const out = redactMessage(input);
    expect(out).toContain("Failing row contains ([values redacted])");
    expect(out).not.toContain("user@example.com");
    expect(out).not.toContain("quoted string");
  });

  it("[v2] 따옴표로 감싼 값 안의 ')' 는 close paren 으로 오인하지 않는다", () => {
    // Postgres composite 는 값 안에 `)` 가 있으면 `"..."` 로 감싸므로 parser 가
    // inQuoted 상태에서 `)` 를 무시하지 않으면 조기 종료되어 뒤쪽 PII 가 노출된다.
    const input = `DETAIL: Failing row contains (a3f9b1c2, "홍길동 (대표)", "foo,bar", user@example.com).`;
    const out = redactMessage(input);
    expect(out).toContain("Failing row contains ([values redacted])");
    expect(out).not.toContain("홍길동");
    expect(out).not.toContain("대표");
    expect(out).not.toContain("foo,bar");
    expect(out).not.toContain("user@example.com");
    expect(out).not.toContain("a3f9b1c2");
  });

  it('[v2] Postgres composite 의 "" escape (double-double-quote) 를 정확히 소비한다', () => {
    // Postgres 는 quoted 값 내부의 `"` 를 `""` 로 escape 한다.
    // 예: 사용자가 이름을 `홍"길동` 으로 넣으면 composite 출력은 `"홍""길동"` 이 된다.
    // parser 가 `""` 를 두 문자로 처리하지 않으면 첫 번째 `"` 에서 inQuoted 를 종료해
    // 뒤쪽에 있는 진짜 `)` 를 조기 close paren 으로 오인할 수 있다.
    const input = `Failing row contains (1, "say ""hello"" (loudly)", user@example.com).`;
    const out = redactMessage(input);
    expect(out).toContain("Failing row contains ([values redacted])");
    expect(out).not.toContain("hello");
    expect(out).not.toContain("loudly");
    expect(out).not.toContain("user@example.com");
  });

  it("[v2] 값 안에 중첩 괄호 '(...)' 가 있어도 depth 를 정확히 추적한다", () => {
    // 방어적 케이스: 감싸지 않은 값에 우연히 괄호가 있는 시나리오.
    // Postgres 는 이런 경우 quoted 로 감싸는 것이 정상이지만, 방어적으로 parenDepth 로 처리.
    // 이 테스트는 "quoted 안에서만 depth 추적한다" 는 잘못된 구현을 걸러낸다.
    const input = `Failing row contains (1, "nested (paren) inside", 2, sensitive@example.com).`;
    const out = redactMessage(input);
    expect(out).toContain("Failing row contains ([values redacted])");
    expect(out).not.toContain("sensitive@example.com");
    expect(out).not.toContain("nested");
  });

  it("[v2] 미종결 괄호 (파싱 실패) 는 문자열 끝까지 통째로 redact 한다 (fail-safe)", () => {
    // parser 는 매칭 실패 시 문자열 끝까지 redact 하여 PII 노출을 방지해야 한다.
    // "부분 유출보다 과잉 마스킹이 낫다" 원칙.
    const input =
      "ERROR: broken output\nFailing row contains (a3f9b1c2, user@example.com, 홍길동";
    const out = redactMessage(input);
    expect(out).toContain("Failing row contains ([values redacted])");
    expect(out).not.toContain("user@example.com");
    expect(out).not.toContain("홍길동");
    expect(out).not.toContain("a3f9b1c2");
  });

  it("[v2] marker 앞의 원본 텍스트는 보존한다 (debug 가치 유지)", () => {
    // parser 는 marker 앞의 컨텍스트 (예: "DETAIL:", "ERROR:") 를 잘라내지 않아야 한다.
    // 그래야 어떤 종류의 위반인지 debug 가능하다.
    const input =
      'ERROR: null value in column "email" violates not-null constraint\nDETAIL: Failing row contains (1, alice@x.com).';
    const out = redactMessage(input);
    expect(out).toContain("null value in column");
    expect(out).toContain('"email"');
    expect(out).toContain("not-null constraint");
    expect(out).toContain("DETAIL:");
    expect(out).not.toContain("alice@x.com");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Oracle v2 BLOCK #2: Postgres parameter dump 마스킹
// ────────────────────────────────────────────────────────────────────────────
// Postgres 는 실패 컨텍스트에 파라미터 값을 별도 형태로 dump 하는 경우가 있다:
//   - "CONTEXT: unnamed portal parameter $1 = 'user@example.com'"
//   - "parameters: $1 = '홍길동', $2 = '010-1234-5678'"
// SQL 텍스트는 redact 되어도 이 파라미터 dump 로 PII 가 그대로 노출되므로 별도 마스킹 필수.

describe("redactMessage - PG_PARAMETER_DUMP_PATTERN (#70 Oracle v2 BLOCK #2)", () => {
  it("단일 파라미터 dump ($1 = 'value') 를 마스킹한다", () => {
    const input = "CONTEXT: unnamed portal parameter $1 = 'user@example.com'";
    const out = redactMessage(input);
    expect(out).toContain("$1 = [value redacted]");
    expect(out).not.toContain("user@example.com");
  });

  it("다중 파라미터 dump 를 모두 마스킹한다 (콤마로 구분된 여러 $N)", () => {
    const input = "parameters: $1 = '홍길동', $2 = '010-1234-5678', $3 = 'user@example.com'";
    const out = redactMessage(input);
    expect(out).toContain("$1 = [value redacted]");
    expect(out).toContain("$2 = [value redacted]");
    expect(out).toContain("$3 = [value redacted]");
    expect(out).not.toContain("홍길동");
    expect(out).not.toContain("010-1234-5678");
    expect(out).not.toContain("user@example.com");
  });

  it("unquoted 값 (NULL, 숫자, bool) 도 마스킹한다", () => {
    const input = "parameters: $1 = NULL, $2 = 42, $3 = true, $4 = 3.14";
    const out = redactMessage(input);
    expect(out).toContain("$1 = [value redacted]");
    expect(out).toContain("$2 = [value redacted]");
    expect(out).toContain("$3 = [value redacted]");
    expect(out).toContain("$4 = [value redacted]");
    // 숫자·bool 은 PII 는 아니지만 일관성을 위해 마스킹.
    expect(out).not.toMatch(/\$1 = NULL/);
    expect(out).not.toMatch(/\$2 = 42/);
  });

  it("값 안의 '' escape (single-quote escape) 를 안전하게 소비한다", () => {
    // Postgres 는 값 안의 `'` 를 `''` 로 escape 한다.
    // 예: 사용자 이름 O'Brien → '\'O''Brien\''
    // regex 가 `''` 를 두 문자로 처리하지 않으면 첫 `'` 에서 종료되어 뒤쪽이 남는다.
    const input = "parameters: $1 = 'O''Brien', $2 = 'user@example.com'";
    const out = redactMessage(input);
    expect(out).toContain("$1 = [value redacted]");
    expect(out).toContain("$2 = [value redacted]");
    expect(out).not.toContain("O''Brien");
    expect(out).not.toContain("Brien");
    expect(out).not.toContain("user@example.com");
  });

  it("$N 없는 자연어 문장은 그대로 유지한다 (false positive 방지)", () => {
    // "price = 100", "count = 3" 같은 일반 로그를 오탐하지 않아야 한다.
    const input = "cache miss for key = 'user-123'";
    const out = redactMessage(input);
    expect(out).toBe(input);
  });

  it("Postgres $N 문법이 아닌 유사 문자열은 유지한다", () => {
    // "$var = value" 같은 shell 변수 표현은 매칭되지 않아야 한다.
    // regex 는 `\$\d+` (달러 + 숫자) 만 인식하므로 `$var` 는 통과.
    const input = "shell var $HOME = '/root'";
    const out = redactMessage(input);
    // $HOME 은 매치되지 않고 $\d+ 만 매치 대상이므로 그대로 유지.
    expect(out).toContain("$HOME");
    // 단, /root 는 ABSOLUTE_PATH_PATTERN 에 의해 별도 마스킹될 수 있다 (의도된 동작).
  });

  it("parameter dump 와 Failing row 가 함께 있을 때 둘 다 마스킹한다 (통합)", () => {
    // 실전 Postgres 에러는 두 종류를 함께 담는 경우가 흔하다.
    const input =
      "ERROR: duplicate key violates unique constraint\n" +
      "DETAIL: Failing row contains (1, alice@x.com, 홍길동).\n" +
      "CONTEXT: unnamed portal parameter $1 = 'alice@x.com', $2 = '홍길동'";
    const out = redactMessage(input);
    expect(out).toContain("Failing row contains ([values redacted])");
    expect(out).toContain("$1 = [value redacted]");
    expect(out).toContain("$2 = [value redacted]");
    expect(out).not.toContain("alice@x.com");
    expect(out).not.toContain("홍길동");
  });

  it("공백 없는 no-space 형식 ($12='x',$13='y') 도 마스킹한다 (Oracle v3 NIT)", () => {
    // regex 는 `\s*` 로 공백을 0회 이상 허용하므로 no-space 형태에도 반응해야 한다.
    // 실전 Postgres/Drizzle 은 공백을 넣지만, 방어적으로 검증하여 Phase C 전 확실히 커버.
    const input = "params: $12='alice@x.com',$13='홍길동',$14='010-1111-2222'";
    const out = redactMessage(input);
    expect(out).toContain("$12=[value redacted]");
    expect(out).toContain("$13=[value redacted]");
    expect(out).toContain("$14=[value redacted]");
    expect(out).not.toContain("alice@x.com");
    expect(out).not.toContain("홍길동");
    expect(out).not.toContain("010-1111-2222");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// #77: PG_INPUT_SYNTAX_PATTERN — Postgres 타입 coercion 실패 시 값 마스킹
// ────────────────────────────────────────────────────────────────────────────
// Postgres 는 컬럼 타입 coercion 실패 시 원본 값을 그대로 인용한다:
//   invalid input syntax for type uuid: "not-a-uuid-here"
//   invalid input syntax for type integer: "abc"
//   invalid input syntax for type date: "2024-13-45"
// caller-side guard (z.uuid().safeParse 등) 가 있어도 새 액션에서 이를 잊을 수
// 있으므로, defense-in-depth 로 sanitize 레이어에서 재차 마스킹한다.
// UUID 만이 아닌 모든 typename 을 대상으로 하여 integer/date/json/boolean/
// double precision 등 모든 타입 오류에서 원본 값이 로그에 남지 않도록 보장한다.

describe("redactMessage - PG_INPUT_SYNTAX_PATTERN (#77)", () => {
  it("UUID 타입 오류: 원본 값(잠재 PII)을 <redacted> 로 마스킹하고 typename 유지", () => {
    // 이슈 #77 의 원문 케이스. dynamic route param 이 그대로 DB 까지 흘렀을 때.
    const input = 'invalid input syntax for type uuid: "홍길동-사용자-입력"';
    const out = redactMessage(input);
    expect(out).toContain("invalid input syntax for type uuid: <redacted>");
    expect(out).not.toContain("홍길동");
    expect(out).not.toContain("사용자-입력");
  });

  it("이메일이 UUID 컬럼에 들어간 케이스도 마스킹한다", () => {
    // 실전 시나리오: URL param 조작으로 이메일이 UUID 컬럼 조회에 사용됐을 때.
    const input =
      'error: invalid input syntax for type uuid: "alice@example.com" at postgres';
    const out = redactMessage(input);
    expect(out).toContain("type uuid: <redacted>");
    expect(out).not.toContain("alice@example.com");
  });

  it("integer 타입 오류도 마스킹한다 (숫자 컬럼 coercion 실패)", () => {
    // 사용자가 formData 로 정수 필드에 문자열을 넣었을 때. 값 자체는 PII 가 아닐 수 있지만
    // 일관성·debug 정보 최소화 원칙으로 마스킹.
    const input = 'invalid input syntax for type integer: "not-a-number"';
    const out = redactMessage(input);
    expect(out).toContain("invalid input syntax for type integer: <redacted>");
    expect(out).not.toContain("not-a-number");
  });

  it("date 타입 오류도 마스킹한다", () => {
    // 잘못된 생년월일 등 개인정보가 date 컬럼 오류에 실려나올 수 있다.
    const input = 'invalid input syntax for type date: "1990-13-45"';
    const out = redactMessage(input);
    expect(out).toContain("invalid input syntax for type date: <redacted>");
    expect(out).not.toContain("1990-13-45");
  });

  it("boolean 타입 오류도 마스킹한다", () => {
    const input = 'invalid input syntax for type boolean: "maybe"';
    const out = redactMessage(input);
    expect(out).toContain("invalid input syntax for type boolean: <redacted>");
    expect(out).not.toContain("maybe");
  });

  it("json 타입 오류도 마스킹한다 (JSON 필드에 raw 유저 입력이 실릴 수 있음)", () => {
    const input = 'invalid input syntax for type json: "not{valid}json"';
    const out = redactMessage(input);
    expect(out).toContain("invalid input syntax for type json: <redacted>");
    expect(out).not.toContain("not{valid}json");
  });

  it("다중 단어 typename (double precision) 도 올바르게 매치한다", () => {
    // Postgres `format_type_be` 는 "double precision", "character varying",
    // "timestamp with time zone" 등 공백 포함 typename 을 낸다.
    // regex 의 [^:\n"]+? 는 공백을 포함하되 콜론에서 멈춰야 한다.
    const input = 'invalid input syntax for type double precision: "3.14.15"';
    const out = redactMessage(input);
    expect(out).toContain(
      "invalid input syntax for type double precision: <redacted>",
    );
    expect(out).not.toContain("3.14.15");
  });

  it("timestamp with time zone 도 올바르게 매치한다", () => {
    const input =
      'invalid input syntax for type timestamp with time zone: "9999-99-99"';
    const out = redactMessage(input);
    expect(out).toContain(
      "invalid input syntax for type timestamp with time zone: <redacted>",
    );
    expect(out).not.toContain("9999-99-99");
  });

  it("한 메시지에 여러 22P02 오류가 개행으로 분리되어 있을 때 각각 마스킹한다", () => {
    // 실전 Postgres 는 여러 22P02 를 각각의 로그 라인으로 분리해서 낸다
    // (CONTEXT: / DETAIL: 등 라벨과 함께). fail-closed 매칭 ([^\n]*) 은 각 줄에서
    // 독립적으로 반응하여 두 값을 모두 마스킹한다.
    const input =
      'invalid input syntax for type uuid: "abc"\ninvalid input syntax for type integer: "xyz"';
    const out = redactMessage(input);
    expect(out).toContain("type uuid: <redacted>");
    expect(out).toContain("type integer: <redacted>");
    expect(out).not.toContain('"abc"');
    expect(out).not.toContain('"xyz"');
  });

  it('값 내부에 " 가 포함되어도 tail 이 유출되지 않는다 (fail-closed, Oracle #77 BLOCK 회귀)', () => {
    // Postgres 22P02 는 raw %s 로 값을 삽입하므로 사용자 입력의 " 가 escape 없이 실린다.
    // `"[^"]*"` 로 매치하면 첫 번째 " 에서 조기 종료되어 뒤쪽 PII 가 로그에 남는다:
    //   input:  invalid input syntax for type uuid: "ab"cd@example.com"
    //   buggy:  invalid input syntax for type uuid: <redacted>cd@example.com"  ← tail 유출
    //   fixed:  invalid input syntax for type uuid: <redacted>                 ← 줄 끝까지 소비
    // fail-closed [^\n]* 매칭이 이 취약점을 방지하는지 검증한다.
    const input = 'invalid input syntax for type uuid: "ab"cd@example.com"';
    const out = redactMessage(input);
    expect(out).toContain("type uuid: <redacted>");
    // tail (embedded quote 이후 부분) 이 절대 남지 않아야 한다.
    expect(out).not.toContain("cd@example.com");
    expect(out).not.toContain("example.com");
  });

  it('여러 embedded quote 가 있어도 안전하게 마스킹한다 (fail-closed)', () => {
    // 방어적 케이스: 값 안에 " 가 여러 개 있는 경우.
    // 예: 사용자가 SQL injection 시도를 UUID 컬럼에 넣었을 때 " 문자가 다수 포함될 수 있다.
    const input =
      'invalid input syntax for type uuid: "\'; DROP TABLE users;--"@x.com"';
    const out = redactMessage(input);
    expect(out).toContain("type uuid: <redacted>");
    expect(out).not.toContain("DROP TABLE");
    expect(out).not.toContain("@x.com");
    expect(out).not.toContain("users");
  });

  it("빈 값 (\"\") 도 마스킹한다 — 값 부분이 비어있어도 여전히 <redacted>", () => {
    // 사용자가 빈 문자열을 UUID 컬럼에 넣은 경우.
    const input = 'invalid input syntax for type uuid: ""';
    const out = redactMessage(input);
    expect(out).toContain("type uuid: <redacted>");
    // 원본 형태가 남지 않음을 확인.
    expect(out).not.toMatch(/type uuid: ""/);
  });

  it("false positive 방지: '...syntax for type X...' 자연어에 값 부분이 없으면 매치 안 함", () => {
    // regex 는 `: "..."` 를 요구하므로 자연어 문장은 지나쳐야 한다.
    const input =
      "The correct syntax for type checking is documented in the guide";
    const out = redactMessage(input);
    expect(out).toBe(input);
    expect(out).not.toContain("<redacted>");
  });

  it("false positive 방지: colon·따옴표 없는 유사 문장은 유지한다", () => {
    // "invalid input syntax for type uuid" 만 있고 값이 없는 문장 (설명 문서 등).
    const input = "Documentation: invalid input syntax for type uuid errors";
    const out = redactMessage(input);
    // 값 부분이 없으므로 매치되지 않아 원본 유지.
    expect(out).toBe(input);
  });

  it("typename 은 debug 힌트로 유지된다 (어느 타입 coercion 실패인지 확인 가능)", () => {
    // 목적: 값은 마스킹하되 어느 컬럼 타입에서 실패했는지는 debug 로 남긴다.
    const input = 'invalid input syntax for type uuid: "corrupt-value"';
    const out = redactMessage(input);
    // typename "uuid" 는 남아있어야 한다.
    expect(out).toContain("uuid");
    // 값은 사라져야 한다.
    expect(out).not.toContain("corrupt-value");
  });

  it("sanitizeError 를 통해 호출해도 동일하게 마스킹된다 (통합 확인)", () => {
    // 실제 서버 액션에서는 redactMessage 를 직접 호출하지 않고 sanitizeError 를 거친다.
    const err = new Error('invalid input syntax for type uuid: "leaked-pii-value"');
    const out = sanitizeError(err);
    expect(out.message).toContain("type uuid: <redacted>");
    expect(out.message).not.toContain("leaked-pii-value");
  });
});


describe("redactMessage - SQL false positive 방지 (#70 Oracle NIT #3)", () => {
  // SQL_KEYWORD_PATTERN 이 자연어 로그 메시지를 삼키면 debug 가 어려워진다.
  // Drizzle SQL 은 항상 구조 마커(VALUES / SET / FROM / ( 등) 를 동반하므로
  // 이 마커가 없는 자연어 문장은 그대로 유지되어야 한다.

  it("'Cannot update headers after they are sent' 는 UPDATE ... SET 구조가 아니므로 유지한다", () => {
    // Node.js/Express 계열에서 자주 등장하는 실제 에러 메시지.
    const input = "Cannot update headers after they are sent to the client";
    const out = redactMessage(input);
    expect(out).toBe("Cannot update headers after they are sent to the client");
    expect(out).not.toContain("[SQL redacted]");
  });

  it("'Please select a valid option' 는 SELECT ... FROM 구조가 아니므로 유지한다", () => {
    // 주의: "select ... from ..." 문장은 preposition "from" 이 SQL FROM 과 겹쳐 매치될 수
    // 있으므로 (예: "select an option from the dropdown"), Oracle 예시대로 from 없는 문장을 사용한다.
    const input = "Please select a valid option to continue";
    const out = redactMessage(input);
    expect(out).toBe("Please select a valid option to continue");
    expect(out).not.toContain("[SQL redacted]");
  });

  it("'Please insert into the form' 는 INSERT INTO ident ( 구조가 아니므로 유지한다", () => {
    const input = "Please insert into the form your full name";
    const out = redactMessage(input);
    expect(out).toContain("Please insert into the form");
    expect(out).not.toContain("[SQL redacted]");
  });

  it("'with regard to X' 는 WITH ident AS( 구조가 아니므로 유지한다", () => {
    const input = "with regard to your recent submission";
    const out = redactMessage(input);
    expect(out).toBe("with regard to your recent submission");
    expect(out).not.toContain("[SQL redacted]");
  });

  it("'create user account' 는 CREATE {TABLE|INDEX|VIEW|SCHEMA} 구조가 아니므로 유지한다", () => {
    // CREATE 는 스키마 객체(TABLE|INDEX|UNIQUE|VIEW|SCHEMA) 앞에서만 매치하도록 좁혔음.
    const input = "Failed to create user account";
    const out = redactMessage(input);
    expect(out).toBe("Failed to create user account");
    expect(out).not.toContain("[SQL redacted]");
  });

  it("'alter your plans' 는 ALTER {TABLE|INDEX} 구조가 아니므로 유지한다", () => {
    const input = "You cannot alter your plans after checkout";
    const out = redactMessage(input);
    expect(out).toContain("alter your plans");
    expect(out).not.toContain("[SQL redacted]");
  });

  it("'drop the ball' 는 DROP {TABLE|INDEX|VIEW|SCHEMA} 구조가 아니므로 유지한다", () => {
    const input = "Do not drop the ball on this deadline";
    const out = redactMessage(input);
    expect(out).toBe("Do not drop the ball on this deadline");
    expect(out).not.toContain("[SQL redacted]");
  });
});

describe("sanitizeError", () => {
  it("Error 객체에서 name / message / code 를 추출한다", () => {
    const err = new Error("network error");
    const out = sanitizeError(err);
    expect(out).toEqual({ name: "Error", message: "network error", code: undefined });
  });

  it("Error 서브클래스의 name 을 유지한다 (예: NeonHttpError)", () => {
    class NeonHttpError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = "NeonHttpError";
      }
    }
    const out = sanitizeError(new NeonHttpError("network"));
    expect(out.name).toBe("NeonHttpError");
  });

  it("Postgres error code (문자열 code 필드) 를 포함한다", () => {
    const err = new Error("duplicate key");
    (err as unknown as { code: string }).code = "23505";
    const out = sanitizeError(err);
    expect(out.code).toBe("23505");
  });

  it("code 필드가 문자열이 아니면 undefined 로 둔다 (any 오염 차단)", () => {
    const err = new Error("x");
    (err as unknown as { code: number }).code = 42;
    const out = sanitizeError(err);
    expect(out.code).toBeUndefined();
  });

  it("Error 가 아닌 값이 throw 된 경우 UnknownError 로 감싼다 (문자열)", () => {
    const out = sanitizeError("string thrown");
    expect(out.name).toBe("UnknownError");
    expect(out.message).toBe("string thrown");
  });

  it("null 도 UnknownError 로 안전 처리한다", () => {
    expect(sanitizeError(null).name).toBe("UnknownError");
  });

  it("undefined 도 UnknownError 로 안전 처리한다", () => {
    expect(sanitizeError(undefined).name).toBe("UnknownError");
  });

  it("Error 의 message 안에 포함된 SQL 도 제거한다", () => {
    const err = new Error("INSERT INTO users (email) VALUES ('x@y.com')");
    const out = sanitizeError(err);
    expect(out.message).toContain("[SQL redacted]");
    expect(out.message).not.toContain("x@y.com");
  });
});

describe("sanitizeError - 예외 안전성 (#70 Oracle NIT #4)", () => {
  // 병리적 error 서브클래스가 getter throw 로 sanitize 를 깨뜨리면
  // 원본 error 정보가 함께 사라져 debug 가 불가능해진다.
  // 본 헬퍼는 어떤 입력에도 throw 하지 않아야 하며, 최소한 debug 힌트라도 반환해야 한다.

  it("code getter 가 throw 해도 sanitize 는 성공한다 (name/message 는 살아남음)", () => {
    const err = new Error("original message");
    // instance 에 own property 로 throwing getter 를 설치한다.
    // 프로토타입 체인이 아닌 own property 로 정의해야 getter 가 실제로 실행된다.
    Object.defineProperty(err, "code", {
      get() {
        throw new Error("code getter boom");
      },
    });
    expect(() => sanitizeError(err)).not.toThrow();
    const out = sanitizeError(err);
    expect(out.name).toBe("Error");
    expect(out.message).toBe("original message");
    expect(out.code).toBeUndefined();
  });

  it("message getter 가 throw 해도 sanitize 는 성공한다", () => {
    // 인자 없이 super() 를 부르면 own message 프로퍼티가 설정되지 않아
    // 우리가 정의한 throwing getter 가 그대로 실행된다.
    const err = new Error();
    Object.defineProperty(err, "message", {
      get() {
        throw new Error("message getter boom");
      },
      configurable: true,
    });
    expect(() => sanitizeError(err)).not.toThrow();
    const out = sanitizeError(err);
    // 최소한 name 은 살아있고, message 는 빈 문자열이어야 한다.
    expect(out.name).toBe("Error");
    expect(typeof out.message).toBe("string");
  });

  it("name getter 가 throw 해도 fallback 이름 'Error' 를 사용한다", () => {
    const err = new Error("x");
    Object.defineProperty(err, "name", {
      get() {
        throw new Error("name getter boom");
      },
      configurable: true,
    });
    expect(() => sanitizeError(err)).not.toThrow();
    const out = sanitizeError(err);
    expect(out.name).toBe("Error");
    expect(out.message).toBe("x");
  });

  it("Error 가 아닌 값의 toString 이 throw 해도 [unstringifiable] 로 처리한다", () => {
    const bad = {
      toString() {
        throw new Error("cannot stringify");
      },
    };
    expect(() => sanitizeError(bad)).not.toThrow();
    const out = sanitizeError(bad);
    expect(out.name).toBe("UnknownError");
    expect(out.message).toBe("[unstringifiable]");
  });

  it("모든 getter 가 동시에 throw 해도 sanitize 자체는 결과를 반환한다", () => {
    // 삼중 방어: name/message/code 전부 실패해도 sanitize 는 살아있어야 한다.
    const err = new Error();
    for (const key of ["name", "message", "code"]) {
      Object.defineProperty(err, key, {
        get() {
          throw new Error(`${key} boom`);
        },
        configurable: true,
      });
    }
    expect(() => sanitizeError(err)).not.toThrow();
    const out = sanitizeError(err);
    // fallback 값들: name="Error", message="", code=undefined
    expect(out.name).toBe("Error");
    expect(typeof out.message).toBe("string");
    expect(out.code).toBeUndefined();
  });
});

describe("redactBlobUrl (#70 Oracle BLOCK #2)", () => {
  // Vercel Blob URL 은 `${timestamp}-${file.name}` 을 path 에 그대로 담아 저장하므로
  // 사용자·관리자가 지정한 파일명(예: "홍길동-프로필.jpg", "01012345678.png") 이
  // URL 안에 그대로 들어간다. 로그에 raw URL 을 남기면 PII 재유출이 발생한다.

  it("정상 Blob URL 에서 hostname + 첫 path segment 만 남기고 파일명을 제거한다", () => {
    const url =
      "https://xyz.public.blob.vercel-storage.com/alumni/1234567890-홍길동-프로필.jpg";
    const out = redactBlobUrl(url);
    expect(out).toBe("xyz.public.blob.vercel-storage.com/alumni/[filename redacted]");
    expect(out).not.toContain("홍길동");
    expect(out).not.toContain("1234567890");
  });

  it("전화번호가 파일명에 포함되어도 마스킹된다", () => {
    const url = "https://x.public.blob.vercel-storage.com/gallery/01012345678-증명사진.png";
    const out = redactBlobUrl(url);
    expect(out).not.toContain("01012345678");
    expect(out).not.toContain("증명사진");
    expect(out).toContain("[filename redacted]");
  });

  it("이메일이 파일명에 포함되어도 마스킹된다", () => {
    const url = "https://x.public.blob.vercel-storage.com/alumni/user@example.com.png";
    const out = redactBlobUrl(url);
    expect(out).not.toContain("user@example.com");
    expect(out).toContain("[filename redacted]");
  });

  it("첫 path segment (feature 폴더명) 는 유지하여 debug 힌트를 남긴다", () => {
    // "어느 feature 의 Blob 삭제가 실패하는가" 를 debug 하려면 최소한 폴더명은 필요하다.
    const url = "https://x.public.blob.vercel-storage.com/gallery/foo.jpg";
    const out = redactBlobUrl(url);
    expect(out).toContain("gallery");
  });

  it("중첩 path 가 있어도 첫 segment 이후 전부 [filename redacted] 로 처리한다", () => {
    // 두 번째 이후 segment 도 사용자 지정일 수 있으므로 통째로 마스킹한다.
    const url = "https://x.public.blob.vercel-storage.com/alumni/2024/홍길동.jpg";
    const out = redactBlobUrl(url);
    expect(out).toBe("x.public.blob.vercel-storage.com/alumni/[filename redacted]");
    expect(out).not.toContain("홍길동");
    expect(out).not.toContain("2024");
  });

  it("path 가 없는 URL 은 hostname 만 반환한다", () => {
    const url = "https://x.public.blob.vercel-storage.com/";
    const out = redactBlobUrl(url);
    expect(out).toBe("x.public.blob.vercel-storage.com");
  });

  it("invalid URL 은 [invalid url] 문자열을 반환한다 (throw 하지 않음)", () => {
    const out = redactBlobUrl("not a url");
    expect(out).toBe("[invalid url]");
  });

  it("빈 문자열도 안전하게 처리한다", () => {
    const out = redactBlobUrl("");
    expect(out).toBe("[invalid url]");
  });
});

describe("logServerError", () => {
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  afterEach(() => {
    consoleErrorSpy.mockClear();
  });

  it("scope 를 대괄호로 감싸 첫 번째 인자로 전달한다", () => {
    logServerError("test/scope", new Error("x"));
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[test/scope]",
      expect.objectContaining({ error: expect.objectContaining({ message: "x" }) }),
    );
  });

  it("context 가 없으면 payload 에 context 키를 넣지 않는다", () => {
    logServerError("t", new Error("x"));
    const call = consoleErrorSpy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(call).not.toHaveProperty("context");
    expect(call).toHaveProperty("error");
  });

  it("context 가 있으면 함께 로그한다 (식별자만 허용됨을 문서상 강제)", () => {
    logServerError("t", new Error("x"), { id: "uuid", count: 3, active: true });
    const call = consoleErrorSpy.mock.calls[0]?.[1] as { context?: Record<string, unknown> };
    expect(call.context).toEqual({ id: "uuid", count: 3, active: true });
  });

  it("error 는 sanitize 된 상태로 로그된다 (SQL 미포함 확인)", () => {
    logServerError("t", new Error("SELECT * FROM users WHERE id=1"));
    const call = consoleErrorSpy.mock.calls[0]?.[1] as { error: { message: string } };
    expect(call.error.message).toContain("[SQL redacted]");
    expect(call.error.message).not.toContain("users");
  });
});

describe("logServerError + redactBlobUrl 통합 (#70 Oracle 재리뷰 대비)", () => {
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  afterEach(() => {
    consoleErrorSpy.mockClear();
  });

  it("blob-utils 가 redactBlobUrl 로 감싼 URL 을 context 로 넘기면 PII 가 로그에 남지 않는다", () => {
    // src/lib/blob-utils.ts:41 의 실제 호출 패턴을 재현한 회귀 테스트.
    // Phase C 확산 시 이 패턴을 모든 Blob 로그 지점에 강제한다.
    const url = "https://xyz.public.blob.vercel-storage.com/alumni/1234-홍길동.jpg";
    logServerError("blob-utils/delete", new Error("blob delete failed"), {
      blobUrl: redactBlobUrl(url),
    });
    const call = consoleErrorSpy.mock.calls[0]?.[1] as { context?: { blobUrl?: string } };
    expect(call.context?.blobUrl).toBe(
      "xyz.public.blob.vercel-storage.com/alumni/[filename redacted]",
    );
    // 로그 payload 전체 어디에도 원본 파일명이 남지 않아야 한다.
    const serialized = JSON.stringify(consoleErrorSpy.mock.calls);
    expect(serialized).not.toContain("홍길동");
    expect(serialized).not.toContain("1234-홍길동.jpg");
  });
});
