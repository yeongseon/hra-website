/**
 * NODE_OPTIONS --import로 로드하는 QA 전용 fetch 전송 어댑터입니다.
 * 실제 앱 모듈을 바꾸지 않고 명시된 .invalid Neon 요청만 격리 PostgreSQL에 전달합니다.
 */
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "./neon-psql-transport.mjs";

const execute = createPsqlTransport(process.env);
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, options = {}) => {
  const url = input instanceof Request ? input.url : String(input);
  const headers = new Headers(options.headers || (input instanceof Request ? input.headers : undefined));
  if (url !== qaNeonEndpoint) {
    if (headers.has("Neon-Connection-String")) throw new Error("QA에서 외부 DB 연결을 차단했습니다.");
    return nativeFetch(input, options);
  }
  if (headers.get("Neon-Connection-String") !== qaDatabaseUrl || options.method !== "POST") {
    throw new Error("QA Neon 요청의 실행 범위가 일치하지 않습니다.");
  }
  try {
    const payload = JSON.parse(options.body);
    if (payload.queries) throw new Error("이 QA 전송은 단일 요청만 지원합니다.");
    return Response.json(await execute(payload));
  } catch (error) {
    // 원래 SQL/오류는 출력하지 않고 고정된 실행 단계와 SQLSTATE만 진단합니다.
    const code = error instanceof Error ? error.message.match(/\(([0-9A-Z]{5}|unknown)\)$/)?.[1] : undefined;
    console.error(`QA_TRANSPORT_FAILURE:${code || "CONTRACT"}`);
    return Response.json({ message: "격리 QA 데이터베이스 요청 실패", code: "QA_TRANSPORT_ERROR" }, { status: 400 });
  }
};
