/** 실제 앱·로그인·SDK·SQL을 연결하는 필수 G1 흐름. 조건부 skip과 production 교체 모듈은 없다. */
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { expect, test, type Browser, type BrowserContext, type Page, type Request, type APIResponse } from "@playwright/test";
import { resourceQaPdfBytes } from "../support/resource-qa-pdf.mjs";
import { qaPassword } from "../support/resource-qa-postgres.mjs";
import { academicG1Actors as actors, academicG1Ids as ids, academicG1Sql, createAcademicG1Assignment } from "../support/academic-g1-fixture.mjs";
import { createAcademicPrivateStore } from "../support/academic-private-store.mjs";
import { academicLocalApi, installAcademicGateNetwork, routeAcademicBrowserNetwork } from "../support/academic-g1-network.mjs";

// 실제 제출에서 얻은 파일·액션을 후속 단계가 검증한다. 실패 뒤 새 작업자의 빈 상태로 계속하지 않는다.
test.describe.configure({ mode: "serial" });

type Actor = keyof typeof actors;
type WireAction = { path: string; action: string; contentType: string; body: string };
const origin = process.env.HRA_G1_APP_ORIGIN ?? "";
const storeOrigin = process.env.HRA_G1_STORE_ORIGIN ?? "";
const blobHost = process.env.ACADEMIC_SUBMISSION_BLOB_HOST ?? "";
const blobToken = process.env.ACADEMIC_SUBMISSION_READ_WRITE_TOKEN ?? "";
const sql = academicG1Sql(process.env);
const contexts = new Map<Actor | "anon", BrowserContext>();
const pdf = resourceQaPdfBytes();
// APIRequestContext는 브라우저 라우터 밖이므로 모든 호출에 동일한 전송 경계를 둔다.
const api = (context: BrowserContext) => academicLocalApi(context.request, origin);
let store: Awaited<ReturnType<typeof createAcademicPrivateStore>>;
let network: ReturnType<typeof installAcademicGateNetwork>;
let blocked = false;
let managementAction: WireAction;
let submissionAction: WireAction;
let filePath = "";

/** 쿠키를 직접 만들지 않고 정상 CSRF·credentials와 현재 DB 세션을 대조한다. */
async function contextFor(browser: Browser, actor: Actor | "anon") {
  const existing = contexts.get(actor);
  if (existing) return existing;
  const context = await browser.newContext({ baseURL: origin, serviceWorkers: "block", ignoreHTTPSErrors: true });
  await routeAcademicBrowserNetwork(context, { appOrigin: origin, browserStoreOrigin: store.browserOrigin, blobHost,
    onBlocked: () => { blocked = true; } });
  if (actor !== "anon") {
    const csrf = await (await api(context).get("/api/auth/csrf")).json();
    await api(context).post("/api/auth/callback/credentials", { form: {
      csrfToken: csrf.csrfToken, email: actors[actor].email, password: qaPassword, callbackUrl: origin,
    }, headers: { Origin: origin, "X-Auth-Return-Redirect": "1" }, maxRedirects: 0 });
    const session = await (await api(context).get("/api/auth/session")).json();
    expect(session.user?.id, "G1_REAL_LOGIN").toBe(actors[actor].id);
  }
  contexts.set(actor, context);
  return context;
}
const actionFrom = (request: Request): WireAction => ({ path: new URL(request.url()).pathname,
  action: request.headers()["next-action"], contentType: request.headers()["content-type"], body: request.postData() ?? "" });
const isSubmission = (request: Request) => request.method() === "POST" && Boolean(request.headers()["next-action"]) &&
  Boolean(request.postData()?.includes("uploadIntentId"));
async function replay(context: BrowserContext, action: WireAction, body = action.body) {
  return api(context).post(action.path, { headers: { Origin: origin, "Next-Action": action.action,
    "Content-Type": action.contentType }, data: body, maxRedirects: 0 });
}
/** Flight 응답 중 최소 액션 DTO만 읽으며 원문은 파일이나 로그로 보내지 않는다. */
async function actionValue(response: APIResponse): Promise<{ success: boolean; submissionId?: string } | null> {
  for (const line of (await response.text()).split("\n")) {
    const encoded = /^[a-z0-9]+:(.*)$/i.exec(line)?.[1];
    if (!encoded?.startsWith("{")) continue;
    try { const value = JSON.parse(encoded); if (typeof value.success === "boolean") return value; }
    catch { continue; }
  }
  return null;
}
async function openAssignment(page: Page, assignment: string) {
  await page.goto(`/member/assignments/${assignment}`);
  await expect(page.getByLabel("제출할 PDF 파일", { exact: true }), "G1_REAL_ASSIGNMENT").toBeVisible();
}
async function selectPdf(page: Page, bytes = pdf, name = "수용 시험.pdf") {
  await page.getByLabel("제출할 PDF 파일", { exact: true }).setInputFiles({ name, mimeType: "application/pdf", buffer: bytes });
}
/** 실제 업로드 다음 최종화 POST만 중단해, 같은 실제 액션을 동시 요청에 사용할 수 있게 한다. */
async function uploadWithoutFinalizing(page: Page, assignment: string) {
  let wire: WireAction | undefined;
  await page.route("**/member/assignments/*", async (route) => {
    if (isSubmission(route.request())) { wire = actionFrom(route.request()); await route.abort("failed"); }
    else await route.continue();
  });
  await openAssignment(page, assignment); await selectPdf(page);
  await page.getByRole("button", { name: "최종 제출", exact: true }).click();
  await expect(page.getByRole("status"), "G1_CAPTURE_FINALIZE").toContainText("같은 요청");
  await page.unroute("**/member/assignments/*");
  if (!wire) throw new Error("G1_FINALIZE_WIRE");
  return wire;
}
async function finalCount(assignment: string) {
  return Number(await sql("SELECT count(*) FROM assignment_submissions s JOIN assignment_targets t ON t.id=s.assignment_target_id WHERE t.assignment_id=$1::uuid", [assignment]));
}
test.beforeAll(async () => {
  if (!origin || !storeOrigin || !blobToken) throw new Error("G1_RUNNER_REQUIRED");
  store = await createAcademicPrivateStore({ host: blobHost, token: blobToken, port: Number(new URL(storeOrigin).port), browserTls: true });
  network = installAcademicGateNetwork({ appOrigin: origin, storeOrigin, blobHost, onBlocked: () => { blocked = true; } });
});
test.beforeEach(async () => {
  // 독립 사례 사이의 제한 원장만 초기화한다. 각 실제 사용자 흐름 안에서는 제한을 우회하지 않는다.
  await sql("DELETE FROM rate_limit_events");
});
test.afterAll(async () => {
  for (const context of contexts.values()) await context.close();
  await network?.close(); await store?.close();
  expect(blocked, "G1_EXTERNAL_REQUEST").toBe(false);
});

test("[G1:ROSTER] 지정 승인자 명부와 미연결·미제출 분모", async ({ browser }) => {
  const page = await (await contextFor(browser, "manager")).newPage();
  await page.goto(`/admin/academics/students?cohort=${ids.cohortA}`);
  await expect(page.getByRole("heading", { name: "학생 명부", exact: true })).toBeVisible();
  await page.goto(`/admin/academics/assignments/${ids.active}/submissions`);
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await expect(page.locator("tbody tr").filter({ hasText: "시험 미연결 학생" })).toContainText("미제출");
  expect(await finalCount(ids.active)).toBe(0);
  await page.close();
});

test("[G1:ADMIN_FLOW] 실제 관리 액션으로 초안·공개·종료", async ({ browser }) => {
  const page = await (await contextFor(browser, "manager")).newPage();
  await page.goto("/admin/academics/assignments/new");
  await page.getByLabel("대상 기수", { exact: true }).selectOption(ids.cohortA);
  await page.getByLabel("과제 제목", { exact: true }).fill("G1 실제 관리 흐름");
  await page.getByLabel("과제 안내", { exact: true }).fill("비민감 시험 안내");
  const kst = new Date(Date.now() + 2 * 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 19);
  await page.getByLabel("마감 일시 (한국시간)", { exact: true }).fill(kst);
  const request = page.waitForRequest((value) => value.method() === "POST" && Boolean(value.headers()["next-action"]));
  await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  managementAction = actionFrom(await request);
  await expect(page.getByRole("heading", { name: "과제 상세", exact: true })).toBeVisible();
  const detail = new URL(page.url()).pathname;
  await expect(page.getByRole("link", { name: "대상별 제출 현황", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "공개 대상 확인", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "확인한 대상으로 공개", exact: true }).click();
  await expect(page.getByText(/과제가 공개되었습니다\.|현재 상태: 공개/).first()).toBeVisible();
  await page.goto(detail); await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.getByRole("link", { name: "대상별 제출 현황", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await page.goto(detail);
  await page.locator("form").getByRole("checkbox").check();
  await page.getByRole("button", { name: "과제 종료", exact: true }).click();
  await expect(page.getByText("종료된 과제입니다. 학생의 추가 제출을 받지 않습니다.", { exact: true })).toBeVisible();
  await page.close();
});

test("[G1:SUBMIT_COUNTS] 실제 업로드·최종화와 학생·운영진 집계 일치", async ({ browser }) => {
  const page = await (await contextFor(browser, "studentA")).newPage();
  const diagnostics = new Set<string>();
  // 요청 주소·본문을 기록하지 않고 고정 단계와 상태 코드만 실패 진단에 남긴다.
  page.on("response", response => {
    const url = new URL(response.url());
    const phase = url.pathname === "/api/academic/uploads/intents" ? "INTENT" : url.pathname === "/api/academic/uploads" ? "TOKEN"
      : url.hostname === "vercel.com" ? "PUT" : response.request().headers()["next-action"] ? "ACTION" : null;
    if (phase) diagnostics.add(`G1_UPLOAD_${phase}_${response.status()}`);
  });
  page.on("requestfailed", request => {
    const url = new URL(request.url());
    diagnostics.add(url.hostname === "vercel.com" ? "G1_UPLOAD_PUT_NETWORK" : "G1_UPLOAD_APP_NETWORK");
    const code = /net::(ERR_[A-Z_]+)/.exec(request.failure()?.errorText ?? "")?.[1];
    if (code) diagnostics.add(`G1_UPLOAD_${code}`);
  });
  page.on("console", value => {
    if (value.type() === "error" && /cors|access.control/i.test(value.text())) diagnostics.add("G1_UPLOAD_CORS");
  });
  await page.goto("/member/assignments");
  await expect(page.getByRole("link", { name: "G1 제출 수용 과제", exact: true })).toBeVisible();
  await expect(page.getByText("다른 기수 비공개 안내", { exact: true })).toHaveCount(0);
  page.on("request", (request) => { if (isSubmission(request)) submissionAction = actionFrom(request); });
  await openAssignment(page, ids.active); await selectPdf(page);
  await page.getByRole("button", { name: "최종 제출", exact: true }).click();
  try { await expect(page.getByRole("heading", { name: "제출 완료", exact: true })).toBeVisible(); }
  catch {
    const count = store.snapshot();
    throw new Error([...diagnostics, `G1_STORE_PUT_${count.PUT}_HEAD_${count.HEAD}_GET_${count.GET}_DENIED_${count.denied}`].join(" "));
  }
  filePath = await page.getByRole("link", { name: "수용 시험.pdf 다운로드", exact: true }).getAttribute("href") ?? "";
  expect(filePath).toMatch(/^\/api\/academic\/submissions\/[a-f0-9-]+\/file\/[a-f0-9-]+$/);
  const submittedAt = await page.getByText(/^제출 시각:/).textContent();
  await page.reload(); await expect(page.getByText(/^제출 시각:/)).toHaveText(submittedAt ?? "");
  expect(await finalCount(ids.active)).toBe(1);
  const manager = await (await contextFor(browser, "manager")).newPage();
  await manager.goto(`/admin/academics/assignments/${ids.active}/submissions`);
  await expect(manager.locator("tbody tr")).toHaveCount(3);
  await expect(manager.locator("tbody tr").filter({ hasText: "시험 학생 가" }).locator("td").nth(2)).toHaveText("제출");
  await expect(manager.locator("tbody tr").filter({ hasText: "시험 미연결 학생" })).toContainText("미제출");
  for (const [label, value] of [["대상", "3명"], ["제출", "1명"], ["미제출", "2명"]]) {
    await expect(manager.locator("dt").filter({ hasText: new RegExp(`^${label}$`) }).locator("..").locator("dd")).toHaveText(value);
  }
  expect(await sql("SELECT count(*) FROM assignment_targets WHERE assignment_id=$1::uuid", [ids.active])).toBe("3");
  await manager.close(); await page.close();
});

test("[G1:ROLE_MATRIX] 역할·기수별 페이지·액션·업로드·최종화·파일·CSV 직접 요청", async ({ browser }) => {
  const assignmentCount = await sql("SELECT count(*) FROM assignments");
  const freshA = await createAcademicG1Assignment(sql);
  const freshB = await createAcademicG1Assignment(sql, { cohort: ids.cohortB });
  const intentsBefore = Number(await sql("SELECT count(*) FROM assignment_upload_intents"));
  let ownerGrant: { pathname: string; uploadIntentId: string } | undefined;
  let permitted = 0;
  for (const actor of [...Object.keys(actors), "anon"] as (Actor | "anon")[]) {
    const context = await contextFor(browser, actor), member = ["studentA", "peerA", "studentB"].includes(actor);
    const management = await api(context).get("/admin/academics/assignments");
    expect(management.status(), `G1_MANAGEMENT_${actor}`).toBe(actor === "manager" ? 200 : ["anon", "pending"].includes(actor) ? 302 : 403);
    const list = await api(context).get("/member/assignments");
    expect(list.status(), `G1_LIST_${actor}`).toBe(actor === "anon" ? 307 : actor === "pending" ? 302 : 200);
    const listing = await list.text();
    for (const hidden of ["academic-uploads/", "blob.vercel-storage.com", "vercel_blob_"]) expect(listing).not.toContain(hidden);
    if (["anon", "pending"].includes(actor)) {
      expect(new URL(list.headers().location, origin).pathname).toBe(actor === "anon" ? "/login" : "/pending");
    } else if (!member) expect(listing).toContain("학생 과제에 접근할 수 없습니다.");
    else {
      expect(listing.includes("G1 제출 수용 과제")).toBe(actor !== "studentB");
      expect(listing.includes("다른 기수 비공개 안내")).toBe(actor === "studentB");
    }
    for (const assignment of [ids.active, ids.other]) {
      const ownCohort = assignment === ids.active ? actor === "studentA" || actor === "peerA" : actor === "studentB";
      const detail = await api(context).get(`/member/assignments/${assignment}`), body = await detail.text();
      for (const hidden of ["academic-uploads/", "blob.vercel-storage.com", "vercel_blob_"]) expect(body).not.toContain(hidden);
      expect(detail.status(), `G1_DETAIL_${actor}`).toBe(actor === "anon" ? 307 : actor === "pending" ? 302 : member && !ownCohort ? 404 : 200);
      if (["anon", "pending"].includes(actor)) expect(new URL(detail.headers().location, origin).pathname).toBe(actor === "anon" ? "/login" : "/pending");
      else if (!member) expect(body).toContain("학생 과제에 접근할 수 없습니다.");
      if (actor !== "studentA" || assignment !== ids.active) expect(body).not.toContain(filePath);
    }
    const file = await api(context).get(filePath);
    expect(file.status(), `G1_FILE_${actor}`).toBe(["studentA", "manager"].includes(actor) ? 200 : actor === "anon" ? 401 : ["peerA", "studentB"].includes(actor) ? 404 : 403);
    expect((await api(context).get(`/api/academic/assignments/${ids.active}/submissions/export`)).status()).toBe(actor === "manager" ? 200 : 403);
    if (actor !== "manager") expect((await actionValue(await replay(context, managementAction)))?.success).not.toBe(true);
    if (actor !== "studentA") expect((await actionValue(await replay(context, submissionAction)))?.success).not.toBe(true);

    // 소비 충돌과 인가 실패를 혼동하지 않도록 새 공개 대상에서 의도·SDK 토큰을 각각 검사한다.
    for (const assignment of [freshA, freshB]) {
      const allowed = assignment === freshA ? actor === "studentA" || actor === "peerA" : actor === "studentB";
      const issued = await api(context).post("/api/academic/uploads/intents", { headers: { Origin: origin },
        data: { assignmentId: assignment, requestId: randomUUID(), originalName: "권한 시험.pdf", sizeBytes: pdf.length, mimeType: "application/pdf" } });
      expect(issued.status(), `G1_INTENT_${actor}`).toBe(allowed ? 200 : actor === "anon" ? 401 : member ? 404 : 403);
      if (allowed) {
        const grant = await issued.json(); permitted++;
        if (actor === "studentA") ownerGrant = grant;
        const authorized = await api(context).post("/api/academic/uploads", { headers: { Origin: origin },
          data: { type: "blob.generate-client-token", payload: { pathname: grant.pathname, multipart: false,
            clientPayload: JSON.stringify({ assignmentId: assignment, uploadIntentId: grant.uploadIntentId }) } } });
        expect(authorized.status(), `G1_OWN_TOKEN_${actor}`).toBe(200);
        expect((await authorized.json()).clientToken).toEqual(expect.any(String));
      }
    }
    if (!ownerGrant) throw new Error("G1_OWNER_GRANT_MISSING");
    const borrowed = await api(context).post("/api/academic/uploads", { headers: { Origin: origin },
      data: { type: "blob.generate-client-token", payload: { pathname: ownerGrant.pathname, multipart: false,
        clientPayload: JSON.stringify({ assignmentId: freshA, uploadIntentId: ownerGrant.uploadIntentId }) } } });
    const expectedTokenStatus = actor === "studentA" ? 200 : actor === "anon" ? 401 : member ? 404 : 403;
    expect(borrowed.status(), `G1_BORROWED_TOKEN_${actor.toUpperCase()}_EXPECTED_${expectedTokenStatus}_ACTUAL_${borrowed.status()}`).toBe(expectedTokenStatus);
  }
  expect(permitted).toBe(3);
  expect(Number(await sql("SELECT count(*) FROM assignment_upload_intents")) - intentsBefore).toBe(3);
  expect(await sql("SELECT count(*) FROM assignments")).toBe(String(Number(assignmentCount) + 2));
  expect(await sql("SELECT count(*) FROM assignment_upload_intents WHERE id=$1::uuid AND state='INTENDED'", [ownerGrant?.uploadIntentId])).toBe("1");
  expect(await finalCount(ids.active)).toBe(1);
});

test("[G1:FILES] private 직접 URL·타인 ID 거부와 허용 파일 해시·감사·첨부 헤더", async ({ browser }) => {
  const owner = await contextFor(browser, "studentA"), manager = await contextFor(browser, "manager");
  const before = Number(await sql("SELECT count(*) FROM academic_submission_file_reads"));
  for (const context of [owner, manager]) {
    const response = await api(context).get(`${filePath}?url=https://untrusted.invalid/ignored.pdf`);
    expect(response.status(), `G1_ALLOWED_FILE_EXPECTED_200_ACTUAL_${response.status()}`).toBe(200);
    expect(createHash("sha256").update(await response.body()).digest("hex")).toBe(createHash("sha256").update(pdf).digest("hex"));
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["content-type"]).toBe("application/octet-stream");
    expect(response.headers()["content-disposition"]).toContain("filename*=UTF-8''");
  }
  expect(Number(await sql("SELECT count(*) FROM academic_submission_file_reads")) - before).toBe(2);
  const peer = await contextFor(browser, "peerA");
  const denied = await api(peer).get(filePath);
  const absent = await api(owner).get(filePath.replace(/[^/]+$/, randomUUID()));
  expect([denied.status(), absent.status()]).toEqual([404, 404]);
  expect(await denied.text()).toBe(await absent.text());
  const key = await sql("SELECT f.storage_key FROM assignment_submission_files f JOIN assignment_submissions s ON s.id=f.submission_id JOIN assignment_targets t ON t.id=s.assignment_target_id WHERE t.assignment_id=$1::uuid", [ids.active]);
  expect((await fetch(`https://${blobHost}/${key}`)).status).toBe(403);
  store.failNext("GET", "unavailable");
  expect((await api(owner).get(filePath)).status()).toBe(503);
});

test("[G1:FILE_BOUNDARIES] 빈 파일·유형·추가 파일·과대 선언·위장 PDF와 비공개/타 기수/마감 거부", async ({ browser }) => {
  const owner = await contextFor(browser, "studentA");
  const assignment = await createAcademicG1Assignment(sql);
  const base = { assignmentId: assignment, requestId: randomUUID(), originalName: "검사.pdf", sizeBytes: pdf.length, mimeType: "application/pdf" };
  for (const change of [{ sizeBytes: 0 }, { sizeBytes: 52_428_801 }, { originalName: "검사.txt" }, { mimeType: "text/html" }, { files: ["one", "two"] }]) {
    const response = await api(owner).post("/api/academic/uploads/intents", { headers: { Origin: origin }, data: { ...base, ...change } });
    expect(response.status()).toBe(422);
  }
  const expired = await sql("SELECT id FROM assignments WHERE due_at<=clock_timestamp() AND status='PUBLISHED' LIMIT 1");
  expect(expired).toBeTruthy();
  for (const selected of [ids.draft, ids.other, ids.closed, expired]) {
    const response = await api(owner).post("/api/academic/uploads/intents", { headers: { Origin: origin }, data: { ...base, assignmentId: selected } });
    expect(response.status()).toBeGreaterThanOrEqual(400);
  }
  const page = await owner.newPage();
  await openAssignment(page, assignment);
  expect(await page.getByLabel("제출할 PDF 파일").getAttribute("multiple")).toBeNull();
  await selectPdf(page, Buffer.from("PDF처럼 보이는 민감하지 않은 텍스트"));
  await page.getByRole("button", { name: "최종 제출", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("PDF");
  expect(await finalCount(assignment)).toBe(0);
  await page.getByRole("button", { name: "업로드 취소 후 다시 시작", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("기존 업로드를 취소했습니다");
  await page.close();
});

test("[G1:FAILURE_RECOVERY] PUT·원본·파일 INSERT 실패와 커밋 후 응답 유실 복구", async ({ browser }) => {
  test.setTimeout(180_000);
  const owner = await contextFor(browser, "studentA");
  for (const fault of ["PUT", "HEAD", "GET", "DATABASE", "RESPONSE"]) {
    await sql("DELETE FROM rate_limit_events");
    const assignment = await createAcademicG1Assignment(sql), page = await owner.newPage();
    await openAssignment(page, assignment); await selectPdf(page);
    if (fault === "PUT") store.failNext("PUT", "forbidden");
    if (fault === "HEAD") store.failNext("HEAD", "wrong-host");
    if (fault === "GET") store.failNext("GET", "unavailable");
    if (fault === "DATABASE") await sql("ALTER TABLE assignment_submission_files ADD CONSTRAINT qa_g1_file_failure CHECK (size_bytes<1) NOT VALID");
    let lost = false;
    if (fault === "RESPONSE") await page.route("**/member/assignments/*", async (route) => {
      if (!lost && isSubmission(route.request())) { lost = true; await route.fetch({ maxRedirects: 0, maxRetries: 0 }); await route.abort("failed"); }
      else await route.continue();
    });
    try {
      await page.getByRole("button", { name: "최종 제출", exact: true }).click();
      await expect(page.getByRole("button", { name: "같은 요청으로 제출 다시 확인", exact: true })).toBeEnabled();
      await expect(page.getByRole("status"), `G1_FAULT_${fault}`).not.toBeEmpty();
      await expect(page.getByRole("heading", { name: "제출 완료", exact: true })).toHaveCount(0);
      expect(await finalCount(assignment)).toBe(fault === "RESPONSE" ? 1 : 0);
    } finally {
      if (fault === "DATABASE") await sql("ALTER TABLE assignment_submission_files DROP CONSTRAINT qa_g1_file_failure");
    }
    if (fault === "PUT") {
      await page.getByRole("button", { name: "업로드 취소 후 다시 시작", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("기존 업로드를 취소했습니다");
      // 새 의도로 재전송하기 전에 실제 60초 제한 창을 기다리며 원장을 삭제하지 않는다.
      await delay(61_000);
      await page.getByRole("button", { name: "최종 제출", exact: true }).click();
    } else await page.getByRole("button", { name: "같은 요청으로 제출 다시 확인", exact: true }).click();
    await expect(page.getByRole("heading", { name: "제출 완료", exact: true }), `G1_RECOVER_${fault}`).toBeVisible();
    expect(await finalCount(assignment)).toBe(1);
    await page.reload(); await expect(page.getByRole("heading", { name: "제출 완료", exact: true })).toBeVisible();
    await page.close();
  }
  await sql("DELETE FROM rate_limit_events");
  const deadline = await createAcademicG1Assignment(sql, { dueSeconds: 12 }), page = await owner.newPage();
  const barrier = store.pauseNextRead();
  try {
    await openAssignment(page, deadline); await selectPdf(page);
    await page.getByRole("button", { name: "최종 제출", exact: true }).click();
    await Promise.race([barrier.started, delay(30_000, undefined, { ref: false }).then(() => { throw new Error("G1_DEADLINE_GET_NOT_STARTED"); })]);
    await sql("SELECT pg_sleep_until(due_at) FROM assignments WHERE id=$1::uuid", [deadline]);
    expect(await sql("SELECT clock_timestamp()>=due_at FROM assignments WHERE id=$1::uuid", [deadline])).toBe("t");
    barrier.release();
    await expect(page.getByRole("button", { name: "같은 요청으로 제출 다시 확인", exact: true })).toBeEnabled();
    await expect(page.getByRole("heading", { name: "제출 완료", exact: true })).toHaveCount(0);
    expect(await finalCount(deadline)).toBe(0);
  } finally { barrier.release(); await page.close(); }
});

test("[G1:CONCURRENCY] 같은 키 동시 요청은 복구하고 다른 키는 한 최종 제출만 남긴다", async ({ browser }) => {
  const owner = await contextFor(browser, "studentA");
  for (const sameKey of [true, false]) {
    await sql("DELETE FROM rate_limit_events");
    const assignment = await createAcademicG1Assignment(sql), page = await owner.newPage();
    const wire = await uploadWithoutFinalizing(page, assignment);
    const input = JSON.parse(wire.body)[0];
    if (sameKey) {
      const key = await sql("SELECT storage_key FROM assignment_upload_intents WHERE id=$1::uuid", [input.uploadIntentId]);
      const receipt = store.receipt(key);
      const anonymous = await contextFor(browser, "anon");
      for (let attempt = 0; attempt < 2; attempt++) expect((await api(anonymous).post("/api/academic/uploads", {
        headers: { "x-vercel-signature": receipt.signature }, data: receipt.body,
      })).status()).toBe(200);
      expect((await api(anonymous).post("/api/academic/uploads", {
        headers: { "x-vercel-signature": "forged" }, data: receipt.body,
      })).status()).toBeGreaterThanOrEqual(400);
      expect(await finalCount(assignment)).toBe(0);
      expect(await sql("SELECT state FROM assignment_upload_intents WHERE id=$1::uuid", [input.uploadIntentId])).toBe("INTENDED");
    }
    const body = sameKey ? wire.body : wire.body.replaceAll(input.submissionKey, randomUUID());
    const results = await Promise.all([replay(owner, wire), replay(owner, wire, body)]);
    const values = await Promise.all(results.map(actionValue));
    expect(values.filter((value) => value?.success).length).toBe(sameKey ? 2 : 1);
    if (sameKey) expect(values[0]?.submissionId).toBe(values[1]?.submissionId);
    expect(await finalCount(assignment)).toBe(1);
    expect(await sql("SELECT count(*) FROM assignment_submission_files f JOIN assignment_submissions s ON s.id=f.submission_id JOIN assignment_targets t ON t.id=s.assignment_target_id WHERE t.assignment_id=$1::uuid", [assignment])).toBe("1");
    await page.close();
  }
});

test("[G1:CSV] 승인자만 대상 전원을 최소 필드·한국시간·수식 방어 CSV로 내보낸다", async ({ browser }) => {
  const manager = await contextFor(browser, "manager");
  const response = await api(manager).get(`/api/academic/assignments/${ids.active}/submissions/export?page=3&pageSize=1`);
  expect(response.status()).toBe(200);
  const bytes = await response.body();
  expect([...bytes.subarray(0, 3)]).toEqual([239, 187, 191]);
  const csv = bytes.toString("utf8");
  expect(csv).toContain("제출 시각(한국시간)");
  expect(csv.trim().split("\r\n")).toHaveLength(4);
  expect(csv).toContain("'=시험 학생 동료");
  expect(csv.match(/,"제출",/g)).toHaveLength(1);
  expect(csv.match(/,"미제출",/g)).toHaveLength(2);
  const submittedAtKst = await sql(`SELECT to_char(s.submitted_at AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS')
    FROM assignment_submissions s JOIN assignment_targets t ON t.id=s.assignment_target_id WHERE t.assignment_id=$1::uuid`, [ids.active]);
  expect(csv).toContain(submittedAtKst);
  for (const value of ["@", "academic-uploads/", "blob.vercel-storage.com", "storage_key", "user_id"]) expect(csv).not.toContain(value);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
});

test("[G1:RETENTION] 학적 종료·역할·세션 철회를 반영하고 공개 분모·최종 기록은 보존한다", async ({ browser }) => {
  const owner = await contextFor(browser, "studentA"), manager = await contextFor(browser, "manager");
  const before = await sql("SELECT count(*) FROM assignment_submissions");
  await expect(sql("DELETE FROM users WHERE id=$1::uuid", [actors.studentA.id])).rejects.toThrow();
  await expect(sql("DELETE FROM cohorts WHERE id=$1::uuid", [ids.cohortA])).rejects.toThrow();
  await expect(sql("UPDATE assignments SET status='DRAFT' WHERE id=$1::uuid", [ids.active])).rejects.toThrow();
  await expect(sql("UPDATE academic_students SET user_id=NULL WHERE id=$1::uuid", [ids.studentA])).rejects.toThrow();
  await expect(sql("INSERT INTO cohort_enrollments(student_id,cohort_id) VALUES($1::uuid,$2::uuid)", [ids.studentA, ids.cohortA])).rejects.toThrow();
  await sql("UPDATE cohort_enrollments SET ended_at=clock_timestamp() WHERE student_id=$1::uuid", [ids.studentA]);
  expect((await api(owner).get(filePath)).status()).toBe(404);
  expect((await api(manager).get(filePath)).status()).toBe(200);
  const lateStudent = randomUUID();
  await sql("INSERT INTO academic_students(id,display_name) VALUES($1::uuid,'공개 후 신규 시험')", [lateStudent]);
  await sql("INSERT INTO cohort_enrollments(student_id,cohort_id)VALUES($1::uuid,$2::uuid)", [lateStudent, ids.cohortA]);
  expect(await sql("SELECT count(*) FROM assignment_targets WHERE assignment_id=$1::uuid", [ids.active])).toBe("3");
  await sql("UPDATE users SET role='PENDING' WHERE id=$1::uuid", [actors.studentA.id]);
  expect((await api(owner).get(filePath)).status()).toBe(403);
  await sql("UPDATE users SET role='MEMBER',session_version=session_version+1 WHERE id=$1::uuid", [actors.studentA.id]);
  expect((await api(owner).get(filePath)).status()).toBe(401);
  expect(await sql("SELECT count(*) FROM assignment_submissions")).toBe(before);
});
