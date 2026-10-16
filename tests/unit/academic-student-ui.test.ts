/** 실제 학생 제출 폼의 실패 보존·동일 키 재시도·서버 재조회 후 완료·접근성을 검증한다. */
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ upload: vi.fn(), finalize: vi.fn(), refresh: vi.fn(), cancel: vi.fn() }));
vi.mock("@/features/academics/assignment-uploads/client", () => ({ uploadAssignmentFile: mocks.upload }));
vi.mock("@/features/academics/submissions/actions", () => ({ finalizeAssignmentSubmission: mocks.finalize }));
vi.mock("@/features/academics/student-assignments/ui-actions", () => ({ refreshMyAssignment: mocks.refresh }));
import { FileSubmissionForm } from "@/app/(member)/member/assignments/_components/file-submission-form";
import type { StudentAssignmentDetail } from "@/features/academics/student-assignments/contracts";
import { readAssignmentAttempt, saveAssignmentAttempt } from "@/features/academics/student-assignments/ui-attempt";
const assignment: StudentAssignmentDetail = { assignmentId: "10000000-0000-4000-8000-000000000001", targetId: "20000000-0000-4000-8000-000000000001", title: "내 과제", instructions: "안내", status: "PUBLISHED", dueAt: "2026-11-01T00:00:00Z", publishedAt: "2026-10-01T00:00:00Z", submission: null, file: null };
const intentId = "30000000-0000-4000-8000-000000000001";
const submissionId = "40000000-0000-4000-8000-000000000001";
const fileId = "50000000-0000-4000-8000-000000000001";
const confirmed = { ...assignment, submission: { submissionId, submittedAt: "2026-10-16T00:01:02Z" }, file: { fileId, originalName: "제출.pdf", mimeType: "application/pdf", sizeBytes: 10 } };
const pdf = new File(["%PDF-1.4"], "제출.pdf", { type: "application/pdf" });
function select(file = pdf) { fireEvent.change(screen.getByLabelText("제출할 PDF 파일"), { target: { files: [file] } }); }
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear();
  vi.stubGlobal("fetch", mocks.cancel);
  mocks.cancel.mockResolvedValue({ ok: true, json: async () => ({ state: "CANCELLED" }) });
  mocks.upload.mockImplementation(async input => { input.onIntent?.(intentId); input.onProgress?.(50); return { uploadIntentId: intentId }; });
  mocks.finalize.mockResolvedValue({ success: true, submissionId });
  mocks.refresh.mockResolvedValue({ success: true, assignment: confirmed });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("실제 업로드·최종화 다음 본인 최종ID/시각을 다시 읽은 후에만 완료를 표시한다", async () => {
  let resolveRefresh: (value: unknown) => void = () => undefined;
  mocks.refresh.mockImplementation(() => new Promise(resolve => { resolveRefresh = resolve; }));
  render(createElement(FileSubmissionForm, { assignment, open: true })); select();
  fireEvent.click(screen.getByRole("button", { name: "최종 제출" }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledWith(assignment.assignmentId));
  expect(screen.queryByRole("heading", { name: "제출 완료" })).toBeNull();
  await act(async () => resolveRefresh({ success: true, assignment: confirmed }));
  expect(screen.getByRole("heading", { name: "제출 완료" })).toBeTruthy();
  expect(screen.getByText(/09:01:02/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "제출.pdf 다운로드" }).getAttribute("href")).toBe(`/api/academic/submissions/${submissionId}/file/${fileId}`);
  expect(mocks.finalize).toHaveBeenCalledWith(expect.objectContaining({ assignmentId: assignment.assignmentId, uploadIntentId: intentId }));
});
it("최종화 응답 유실 뒤 파일과 의도·멱등키를 보존하여 재업로드 없이 같은 요청으로 복구한다", async () => {
  mocks.finalize.mockRejectedValueOnce(new Error("네트워크 응답 유실"));
  render(createElement(FileSubmissionForm, { assignment, open: true })); select(); fireEvent.click(screen.getByRole("button", { name: "최종 제출" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("같은 요청"));
  expect(screen.getByText("선택한 파일: 제출.pdf")).toBeTruthy();
  const first = mocks.finalize.mock.calls[0][0];
  fireEvent.click(screen.getByRole("button", { name: "같은 요청으로 제출 다시 확인" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "제출 완료" })).toBeTruthy());
  expect(mocks.finalize.mock.calls[1][0]).toEqual(first); expect(mocks.upload).toHaveBeenCalledOnce();
});
it("최종화 서버 참조만 기존 live 영역에 표시하고 다음 참조 없는 실패에서는 지운다",async()=>{
  const reference="80000000-0000-4000-8000-000000000001";
  mocks.finalize.mockResolvedValueOnce({success:false,message:"제출 상태를 확인해 주세요.",referenceId:reference})
    .mockResolvedValueOnce({success:false,message:"다시 확인해 주세요."});
  render(createElement(FileSubmissionForm,{assignment,open:true}));select();fireEvent.click(screen.getByRole("button",{name:"최종 제출"}));
  await waitFor(()=>expect(screen.getByRole("status").textContent).toContain(`요청 참조: ${reference}`));
  expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
  const input=mocks.finalize.mock.calls[0][0];
  expect(screen.getByRole("status").textContent).not.toContain(input.submissionKey);
  fireEvent.click(screen.getByRole("button",{name:"같은 요청으로 제출 다시 확인"}));
  await waitFor(()=>expect(screen.getByRole("status").textContent).toBe("다시 확인해 주세요."));
});
it("원본 예외의 임의 referenceId와 URL·SQL은 오류 UI에 표시하지 않는다",async()=>{
  mocks.finalize.mockRejectedValueOnce(Object.assign(new Error("SELECT synthetic@example.invalid https://private.invalid/token"),{referenceId:"80000000-0000-4000-8000-000000000001"}));
  render(createElement(FileSubmissionForm,{assignment,open:true}));select();fireEvent.click(screen.getByRole("button",{name:"최종 제출"}));
  await waitFor(()=>expect(screen.getByRole("status").textContent).toContain("같은 요청"));
  for(const text of["요청 참조","SELECT","synthetic@example.invalid","private.invalid"])expect(screen.getByRole("status").textContent).not.toContain(text);
});
it("취소 HTTP가 반환한 참조도 실패 안내에서 확인할 수 있다",async()=>{
  const reference="90000000-0000-4000-8000-000000000001";
  mocks.finalize.mockResolvedValueOnce({success:false,message:"파일 확인 실패"});mocks.refresh.mockResolvedValue({success:true,assignment});
  mocks.cancel.mockResolvedValueOnce({ok:false,json:async()=>({referenceId:reference,error:"원본 비밀 메시지"})});
  render(createElement(FileSubmissionForm,{assignment,open:true}));select();fireEvent.click(screen.getByRole("button",{name:"최종 제출"}));
  await waitFor(()=>expect(screen.getByRole("status").textContent).toContain("파일 확인 실패"));
  fireEvent.click(screen.getByRole("button",{name:"업로드 취소 후 다시 시작"}));
  await waitFor(()=>expect(screen.getByRole("status").textContent).toContain(`요청 참조: ${reference}`));
  expect(screen.getByRole("status").textContent).not.toContain("원본 비밀 메시지");
});
it("PUT 응답 유실도 발급 시 hook의 의도를 보존하여 서버 검증/최종화로 복구한다", async () => {
  mocks.upload.mockImplementationOnce(async input => { input.onIntent(intentId); throw new Error("PUT 응답 유실"); });
  render(createElement(FileSubmissionForm, { assignment, open: true })); select(); fireEvent.click(screen.getByRole("button", { name: "최종 제출" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("같은 요청"));
  expect(mocks.finalize).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "같은 요청으로 제출 다시 확인" }));
  await waitFor(() => expect(mocks.finalize).toHaveBeenCalledWith(expect.objectContaining({ uploadIntentId: intentId })));
  expect(mocks.upload).toHaveBeenCalledOnce();
});
it.each([new File([], "빈.pdf", { type: "application/pdf" }), new File(["글"], "글.txt", { type: "text/plain" })])("잘못된 파일은 업로드하지 않고 선택 내용과 한국어 오류를 유지한다", async file => {
  render(createElement(FileSubmissionForm, { assignment, open: true })); select(file); fireEvent.click(screen.getByRole("button", { name: "최종 제출" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("50MiB"));
  expect(screen.getByText(`선택한 파일: ${file.name}`)).toBeTruthy(); expect(mocks.upload).not.toHaveBeenCalled();
});
it("브라우저 시각과 관계없이 서버가 마감으로 전달한 화면은 새 업로드를 차단한다", () => {
  render(createElement(FileSubmissionForm, { assignment, open: false }));
  expect(screen.queryByRole("button", { name: "최종 제출" })).toBeNull(); expect(screen.getByLabelText("제출할 PDF 파일").hasAttribute("disabled")).toBe(true);
});
it("새로고침 후 보존한 UUID/의도로 파일 선택 없이 동일 최종화를 복구한다", async () => {
  const saved = { requestId: crypto.randomUUID(), submissionKey: crypto.randomUUID(), uploadIntentId: intentId };
  saveAssignmentAttempt(sessionStorage, `hra-assignment-attempt:${assignment.targetId}`, saved);
  render(createElement(FileSubmissionForm, { assignment, open: false }));
  await waitFor(() => expect(screen.getByRole("button", { name: "같은 요청으로 제출 다시 확인" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "같은 요청으로 제출 다시 확인" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "제출 완료" })).toBeTruthy());
  expect(mocks.finalize).toHaveBeenCalledWith({ assignmentId: assignment.assignmentId, uploadIntentId: intentId, submissionKey: saved.submissionKey });
  expect(mocks.upload).not.toHaveBeenCalled();
});
it("잘못된 저장값·저장소 오류를 신뢰하지 않고 개인정보 없이 UUID만 저장한다", () => {
  expect(readAssignmentAttempt({ getItem: () => '{"submissionKey":"잘못된 값"}' }, "key")).toBeNull();
  expect(saveAssignmentAttempt({ setItem: () => { throw new Error("차단"); } }, "key", { requestId: crypto.randomUUID(), submissionKey: crypto.randomUUID() })).toBe(false);
});

it("위장 PDF 거부 뒤 실제 취소 성공을 확인해야 새 파일과 새 요청으로 제출한다", async () => {
  const nextIntent = "30000000-0000-4000-8000-000000000002";
  mocks.upload.mockImplementation(async input => { const id = mocks.upload.mock.calls.length === 1 ? intentId : nextIntent; input.onIntent(id); return { uploadIntentId: id }; });
  mocks.finalize.mockResolvedValueOnce({ success: false, code: "INVALID_FILE", message: "PDF 내용을 확인해 주세요." });
  mocks.refresh.mockResolvedValueOnce({ success: true, assignment });
  render(createElement(FileSubmissionForm, { assignment, open: true })); select(); fireEvent.click(screen.getByRole("button", { name: "최종 제출" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("PDF 내용을"));
  const previous = mocks.finalize.mock.calls[0][0];
  fireEvent.click(screen.getByRole("button", { name: "업로드 취소 후 다시 시작" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("기존 업로드를 취소했습니다"));
  expect(mocks.cancel).toHaveBeenCalledWith(`/api/academic/uploads/intents/${intentId}`, expect.objectContaining({ method: "DELETE", body: JSON.stringify({ assignmentId: assignment.assignmentId }) }));
  expect(screen.getByLabelText("제출할 PDF 파일").hasAttribute("disabled")).toBe(false);
  expect(screen.getByText("선택한 파일: 제출.pdf")).toBeTruthy();
  select(new File(["%PDF-1.4"], "수정.pdf", { type: "application/pdf" })); fireEvent.click(screen.getByRole("button", { name: "최종 제출" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "제출 완료" })).toBeTruthy());
  const next = mocks.finalize.mock.calls[1][0];
  expect(next.uploadIntentId).toBe(nextIntent); expect(next.submissionKey).not.toBe(previous.submissionKey);
  expect(mocks.upload.mock.calls[1][0].requestId).not.toBe(mocks.upload.mock.calls[0][0].requestId);
});

it("파일 교체 전 이미 확정된 결과를 찾으면 취소하지 않고 기존 완료를 보여준다", async () => {
  mocks.finalize.mockRejectedValueOnce(new Error("응답 유실"));
  render(createElement(FileSubmissionForm, { assignment, open: true })); select(); fireEvent.click(screen.getByRole("button", { name: "최종 제출" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("같은 요청"));
  fireEvent.click(screen.getByRole("button", { name: "업로드 취소 후 다시 시작" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "제출 완료" })).toBeTruthy());
  expect(mocks.cancel).not.toHaveBeenCalled(); expect(mocks.upload).toHaveBeenCalledOnce();
});

it("취소/최종화 경합에서 소비 의도 취소가 거부되면 다시 조회한 완료와 원본 파일을 보존한다", async () => {
  mocks.finalize.mockResolvedValueOnce({ success: false, code: "INVALID_FILE", message: "파일 확인 실패" });
  mocks.refresh.mockResolvedValueOnce({ success: true, assignment }).mockResolvedValueOnce({ success: true, assignment: confirmed });
  mocks.cancel.mockResolvedValueOnce({ ok: false });
  render(createElement(FileSubmissionForm, { assignment, open: true })); select(); fireEvent.click(screen.getByRole("button", { name: "최종 제출" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("파일 확인 실패"));
  fireEvent.click(screen.getByRole("button", { name: "업로드 취소 후 다시 시작" }));
  await waitFor(() => expect(screen.getByRole("link", { name: "제출.pdf 다운로드" })).toBeTruthy());
  expect(mocks.refresh).toHaveBeenCalledTimes(2); expect(mocks.upload).toHaveBeenCalledOnce();
});

it("취소 응답 유실이며 미제출이면 선택 파일·기존 키를 유지하고 재취소 성공 뒤에만 해제한다", async () => {
  mocks.finalize.mockResolvedValueOnce({ success: false, code: "INVALID_FILE", message: "파일 확인 실패" });
  mocks.refresh.mockResolvedValue({ success: true, assignment });
  mocks.cancel.mockRejectedValueOnce(new Error("비밀 내부 오류"));
  render(createElement(FileSubmissionForm, { assignment, open: true })); select(); fireEvent.click(screen.getByRole("button", { name: "최종 제출" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("파일 확인 실패"));
  const key = `hra-assignment-attempt:${assignment.targetId}`; const before = sessionStorage.getItem(key);
  fireEvent.click(screen.getByRole("button", { name: "업로드 취소 후 다시 시작" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("취소를 확인하지 못했습니다"));
  expect(sessionStorage.getItem(key)).toBe(before); expect(screen.getByText("선택한 파일: 제출.pdf")).toBeTruthy();
  expect(screen.getByLabelText("제출할 PDF 파일").hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "업로드 취소 후 다시 시작" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("기존 업로드를 취소했습니다"));
  expect(sessionStorage.getItem(key)).not.toBe(before); expect(screen.getByLabelText("제출할 PDF 파일").hasAttribute("disabled")).toBe(false);
});

it("저장소 기록 실패는 고정 안내를 표시하고 현재 탭의 같은 키 재시도는 유지한다", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("비밀 저장소 예외"); });
  mocks.finalize.mockRejectedValueOnce(new Error("응답 유실"));
  render(createElement(FileSubmissionForm, { assignment, open: true })); select(); fireEvent.click(screen.getByRole("button", { name: "최종 제출" }));
  await waitFor(() => expect(screen.getByRole("note").textContent).toContain("새로고침 후에는 이전 요청을 복구하지 못할 수 있습니다"));
  const previous = mocks.finalize.mock.calls[0][0];
  fireEvent.click(screen.getByRole("button", { name: "같은 요청으로 제출 다시 확인" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "제출 완료" })).toBeTruthy());
  expect(mocks.finalize.mock.calls[1][0]).toEqual(previous);
});

it("객체 없는 업로드 실패도 현재 최종 확인과 안전 취소 뒤 파일을 보존하여 새 의도로 전송한다", async () => {
  mocks.upload.mockImplementationOnce(async input => { input.onIntent(intentId); throw new Error("전송 실패"); });
  mocks.refresh.mockResolvedValueOnce({ success: true, assignment });
  render(createElement(FileSubmissionForm, { assignment, open: true })); select(); fireEvent.click(screen.getByRole("button", { name: "최종 제출" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("같은 요청"));
  const previous = mocks.upload.mock.calls[0][0].requestId;
  fireEvent.click(screen.getByRole("button", { name: "업로드 취소 후 다시 시작" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("기존 업로드를 취소했습니다"));
  expect(screen.getByText("선택한 파일: 제출.pdf")).toBeTruthy();
  expect(screen.getByLabelText("제출할 PDF 파일").hasAttribute("disabled")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "최종 제출" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "제출 완료" })).toBeTruthy());
  expect(mocks.upload.mock.calls[1][0].file).toBe(pdf);
  expect(mocks.upload.mock.calls[1][0].requestId).not.toBe(previous);
});
