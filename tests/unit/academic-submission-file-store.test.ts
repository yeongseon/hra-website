// @vitest-environment node
/**
 * 설치된 Blob SDK가 명시 storeId보다 토큰 저장소를 우선하는 동작을 실제로 통과시킵니다.
 * 네트워크 전송만 격리하고 서비스가 잘못된 저장소의 정상 응답을 거부하는지 검증합니다.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), execute: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { execute: mocks.execute } }));
import { GET } from "@/app/api/academic/submissions/[id]/file/[fileId]/route";

const userId = "10000000-0000-4000-8000-000000000001";
const id = "20000000-0000-4000-8000-000000000001";
const fileId = "30000000-0000-4000-8000-000000000001";
const key = "academic-uploads/v1/40000000-0000-4000-8000-000000000001/document.pdf";
const bytes = new TextEncoder().encode("PDF");
const originalDispatcher = getGlobalDispatcher();
let agent: MockAgent;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ACADEMIC_ENABLED", "true");
  vi.stubEnv("ACADEMIC_APPROVER_USER_ID", "");
  vi.stubEnv("ACADEMIC_SUBMISSION_BLOB_HOST", "submissionqa.private.blob.vercel-storage.com");
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.auth.mockResolvedValue({ user: { id: userId, role: "MEMBER" } });
  mocks.execute.mockResolvedValue({ rows: [{ storage_key: key, original_name: "과제.pdf", mime_type: "application/pdf",
    size_bytes: bytes.length, checksum: "a".repeat(64), access_id: "50000000-0000-4000-8000-000000000001" }] });
});
afterEach(async () => {
  setGlobalDispatcher(originalDispatcher);
  await agent.close();
  vi.restoreAllMocks(); vi.unstubAllEnvs();
});

it("실제 SDK가 토큰의 다른 저장소에서 200을 받아도 스트림을 취소하고 503을 반환한다", async () => {
  vi.stubEnv("ACADEMIC_SUBMISSION_READ_WRITE_TOKEN", "vercel_blob_rw_otherstore_qaonly");
  agent.get("https://otherstore.private.blob.vercel-storage.com").intercept({
    path: `/${key}?cache=0`, method: "GET",
  }).reply(200, "PDF", { headers: { "content-type": "application/pdf", "content-length": String(bytes.length) } });
  const response = await GET(new Request("http://localhost/"), { params: Promise.resolve({ id, fileId }) });
  agent.assertNoPendingInterceptors();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("otherstore");
});

it("실제 SDK의 토큰·설정 저장소와 DB 경로가 일치하면 파일을 전달한다", async () => {
  vi.stubEnv("ACADEMIC_SUBMISSION_READ_WRITE_TOKEN", "vercel_blob_rw_submissionqa_qaonly");
  agent.get("https://submissionqa.private.blob.vercel-storage.com").intercept({
    path: `/${key}?cache=0`, method: "GET",
  }).reply(200, "PDF", { headers: { "content-type": "application/pdf", "content-length": String(bytes.length) } });
  const response = await GET(new Request("http://localhost/"), { params: Promise.resolve({ id, fileId }) });
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("PDF");
  agent.assertNoPendingInterceptors();
});

it("실제 SDK가 토큰 저장소의 대소문자를 URL에 보존해도 같은 DNS 호스트이면 전달한다", async () => {
  vi.stubEnv("ACADEMIC_SUBMISSION_READ_WRITE_TOKEN", "vercel_blob_rw_SubmissionQA_qaonly");
  agent.get("https://submissionqa.private.blob.vercel-storage.com").intercept({
    path: `/${key}?cache=0`, method: "GET",
  }).reply(200, "PDF", { headers: { "content-type": "application/pdf", "content-length": String(bytes.length) } });
  const response = await GET(new Request("http://localhost/"), { params: Promise.resolve({ id, fileId }) });
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("PDF");
  agent.assertNoPendingInterceptors();
});
