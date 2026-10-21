/** 실제 비공개 업로드·서버 검증/최종화·본인 결과 재조회 흐름을 제공하는 학생 제출 폼이다. */
"use client";
import { useEffect, useRef, useState } from "react";
import { uploadAssignmentFile } from "@/features/academics/assignment-uploads/client";
import { AcademicUploadError, assignmentUploadInput } from "@/features/academics/assignment-uploads/contract";
import { finalizeAssignmentSubmission } from "@/features/academics/submissions/actions";
import { cancelMyAssignmentUpload } from "@/features/academics/student-assignments/ui-cancel-upload";
import { refreshMyAssignment } from "@/features/academics/student-assignments/ui-actions";
import { readAssignmentAttempt, saveAssignmentAttempt, type AssignmentAttempt } from "@/features/academics/student-assignments/ui-attempt";
import type { StudentAssignmentDetail } from "@/features/academics/student-assignments/contracts";
import { formatKstDateTimeWithSeconds } from "@/lib/date-time";
import { AcademicRequestReference } from "@/components/academics/request-reference";
import { readAcademicRequestReference } from "@/lib/academic-request-reference";

export function FileSubmissionForm({ assignment, open }: { assignment: StudentAssignmentDetail; open: boolean }) {
  const storageKey = `hra-assignment-attempt:${assignment.targetId}`;
  const attempt = useRef<AssignmentAttempt | null>(null);
  const inFlight = useRef(false);
  const completeHeading = useRef<HTMLHeadingElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const restoreFileFocus = useRef(false);
  const [hasIntent, setHasIntent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [storageWarning, setStorageWarning] = useState("");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<"idle" | "uploading" | "finalizing" | "checking" | "error">("idle");
  const [message, setMessage] = useState("");
  const [referenceId, setReferenceId] = useState<string>();
  const [confirmed, setConfirmed] = useState(assignment.submission ? assignment : null);
  const busy = stage === "uploading" || stage === "finalizing" || stage === "checking";

  useEffect(() => { if (confirmed?.submission) completeHeading.current?.focus(); }, [confirmed]);
  useEffect(() => { if (!hasIntent && restoreFileFocus.current) { fileInput.current?.focus(); restoreFileFocus.current = false; } }, [hasIntent]);
  useEffect(() => {
    try { attempt.current = readAssignmentAttempt(sessionStorage, storageKey); setHasIntent(Boolean(attempt.current?.uploadIntentId)); }
    catch { setStorageWarning("재시도 정보를 저장하지 못했습니다. 현재 화면에서는 다시 시도할 수 있지만 새로고침 후에는 이전 요청을 복구하지 못할 수 있습니다."); }
  }, [storageKey]);
  function remember(value: AssignmentAttempt) {
    attempt.current = value; setHasIntent(Boolean(value.uploadIntentId));
    try {
      if (!saveAssignmentAttempt(sessionStorage, storageKey, value)) setStorageWarning("재시도 정보를 저장하지 못했습니다. 현재 화면에서는 다시 시도할 수 있지만 새로고침 후에는 이전 요청을 복구하지 못할 수 있습니다.");
    } catch { setStorageWarning("재시도 정보를 저장하지 못했습니다. 현재 화면에서는 다시 시도할 수 있지만 새로고침 후에는 이전 요청을 복구하지 못할 수 있습니다."); }
  }
  async function confirm() {
    setReferenceId(undefined);
    setStage("checking");
    const result = await refreshMyAssignment(assignment.assignmentId);
    if (!result.success || !result.assignment.submission?.submissionId || !result.assignment.submission.submittedAt) {
      setStage("error"); setMessage("최종 제출 결과를 확인하지 못했습니다. 같은 요청으로 다시 시도해 주세요."); return false;
    }
    setConfirmed(result.assignment); setStage("idle"); setMessage("과제 제출을 완료했습니다.");
    try { sessionStorage.removeItem(storageKey); } catch { return true; }
    return true;
  }
  async function submit() {
    if (busy || inFlight.current) return;
    inFlight.current = true;
    setMessage("");
    setReferenceId(undefined);
    let current: AssignmentAttempt = { ...(attempt.current ?? { requestId: crypto.randomUUID(), submissionKey: crypto.randomUUID() }) };
    remember(current);
    try {
      if (!current.uploadIntentId) {
        if (!open) { setStage("error"); setMessage("제출 마감이 지나 새 파일을 올릴 수 없습니다."); return; }
        const parsed = file && assignmentUploadInput.safeParse({ assignmentId: assignment.assignmentId, requestId: current.requestId, originalName: file.name, sizeBytes: file.size, mimeType: file.type });
        if (!file || !parsed || !parsed.success) { setStage("error"); setMessage("비어 있지 않은 PDF 파일 한 개를 50MiB 이하로 선택해 주세요."); return; }
        setStage("uploading"); setProgress(0);
        const uploaded = await uploadAssignmentFile({ assignmentId: assignment.assignmentId, file, requestId: current.requestId,
          onProgress: value => setProgress(Math.min(100, Math.max(0, Math.round(value)))),
          onRequestReference: value => setReferenceId(readAcademicRequestReference(value)),
          onIntent: id => { current = { ...current, uploadIntentId: id }; remember(current); } });
        current = { ...current, uploadIntentId: uploaded.uploadIntentId }; remember(current);
      }
      if (!current.uploadIntentId) throw new Error("업로드 의도가 없습니다.");
      setStage("finalizing");
      const result = await finalizeAssignmentSubmission({ assignmentId: assignment.assignmentId, uploadIntentId: current.uploadIntentId, submissionKey: current.submissionKey });
      if (!result.success) { setStage("error"); setMessage(result.code==="RATE_LIMITED"?new AcademicUploadError("RATE_LIMITED",result.retryAfterSeconds).message:result.message); setReferenceId(readAcademicRequestReference(result.referenceId)); return; }
      await confirm();
    } catch (error) {
      setStage("error"); setMessage(error instanceof AcademicUploadError && error.code==="RATE_LIMITED"?error.message:"전송 또는 제출 결과를 확인하지 못했습니다. 선택한 파일과 같은 요청으로 다시 시도해 주세요.");
    } finally { inFlight.current = false; }
  }
  async function startNewUpload() {
    if (busy || inFlight.current) return;
    inFlight.current = true;
    setStage("checking"); setMessage("");
    setReferenceId(undefined);
    try {
      // 불확실한 최종화의 결과를 먼저 복구한다. 이미 확정됐다면 취소나 파일 교체를 하지 않는다.
      const latest = await refreshMyAssignment(assignment.assignmentId);
      if (!latest.success) { setStage("error"); setMessage(latest.message); return; }
      if (latest.assignment.submission) { setConfirmed(latest.assignment); setStage("idle"); return; }
      const previousIntent = attempt.current?.uploadIntentId;
      if (!previousIntent) { setStage("error"); setMessage("이전 업로드 요청을 확인하지 못했습니다. 제출 결과를 다시 확인해 주세요."); return; }
      const cancelled = await cancelMyAssignmentUpload(assignment.assignmentId, previousIntent,
        value => setReferenceId(readAcademicRequestReference(value)));
      if (!cancelled) {
        // 취소와 최종화가 경합하거나 취소 응답이 유실돼도 기존 요청을 버리지 않는다.
        const current = await refreshMyAssignment(assignment.assignmentId);
        if (current.success && current.assignment.submission) { setConfirmed(current.assignment); setStage("idle"); return; }
        setStage("error"); setMessage("기존 업로드 취소를 확인하지 못했습니다. 같은 요청으로 결과를 확인하거나 다시 취소해 주세요."); return;
      }
      // 명시적 취소 성공 후에만 새 키와 파일 선택을 허용한다. 현재 파일은 보존하고 이전 Blob을 직접 삭제하지 않는다.
      remember({ requestId: crypto.randomUUID(), submissionKey: crypto.randomUUID() });
      restoreFileFocus.current = true;
      setStage("idle"); setMessage("기존 업로드를 취소했습니다. 선택한 파일로 다시 제출하거나 다른 PDF 파일을 선택해 주세요.");
    } catch { setStage("error"); setMessage("제출 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요."); }
    finally { inFlight.current = false; }
  }
  if (confirmed?.submission) return <section className="space-y-3 rounded-xl border border-[#D9D9D9] p-5" aria-label="최종 제출 결과">
    <h2 ref={completeHeading} tabIndex={-1} className="text-xl font-bold">제출 완료</h2><p role="status" aria-live="polite">최종 제출 결과를 확인했습니다.</p><p>제출 시각: {formatKstDateTimeWithSeconds(new Date(confirmed.submission.submittedAt))}</p>
    {confirmed.file && <a className="break-all text-[#2563EB] underline" href={`/api/academic/submissions/${confirmed.submission.submissionId}/file/${confirmed.file.fileId}`}>{confirmed.file.originalName} 다운로드</a>}
    <p className="text-sm text-[#666666]">최종 제출한 파일은 교체하거나 다시 제출할 수 없습니다.</p>
  </section>;
  return <section className="space-y-4 rounded-xl border border-[#D9D9D9] p-5" aria-label="과제 파일 제출">
    <h2 className="text-xl font-bold">파일 제출</h2>
    {!open && <p>과제가 종료되었거나 제출 마감이 지났습니다.</p>}
    <p id="assignment-file-help" className="text-sm text-[#666666]">비어 있지 않은 PDF 한 개, 최대 50MiB를 제출할 수 있습니다. 최종 제출 후에는 교체할 수 없습니다.</p>
    <label htmlFor="assignment-file" className="block font-medium">제출할 PDF 파일</label>
    <input ref={fileInput} id="assignment-file" type="file" accept="application/pdf,.pdf" disabled={busy || !open || hasIntent} aria-describedby="assignment-file-help assignment-status" onChange={event => { setFile(event.target.files?.[0] ?? null); setMessage(""); setReferenceId(undefined); }} className="block w-full max-w-full rounded border border-[#D9D9D9] p-2" />
    {file && <p className="break-all text-sm">선택한 파일: {file.name}</p>}
    {hasIntent && <p className="text-sm text-[#666666]">이전 파일과 같은 요청으로 제출 결과를 복구합니다. 전송에 실패했거나 파일을 바꾸려면 기존 업로드를 취소한 뒤 다시 시작해 주세요.</p>}
    {stage === "uploading" && <div><label htmlFor="assignment-progress">파일 전송 {progress}%</label><progress id="assignment-progress" value={progress} max={100} className="block w-full" /></div>}
    <div id="assignment-status" role="status" aria-live="polite" aria-atomic="true"><p>{stage === "uploading" ? "파일을 전송하고 있습니다." : stage === "finalizing" ? "파일 검증과 최종 제출을 처리하고 있습니다." : stage === "checking" ? "최종 제출 결과를 확인하고 있습니다." : message}</p>
      {stage === "error" && <AcademicRequestReference referenceId={referenceId} />}
    </div>
    {storageWarning && <p role="note" className="text-sm text-[#666666]">{storageWarning}</p>}
    <div className="flex flex-wrap gap-3">
      {(open || hasIntent) && <button type="button" disabled={busy} onClick={() => void submit()} className="rounded bg-[#2563EB] px-4 py-3 text-white disabled:opacity-50">{hasIntent ? "같은 요청으로 제출 다시 확인" : "최종 제출"}</button>}
      {hasIntent && open && <button type="button" disabled={busy} onClick={() => void startNewUpload()} className="rounded border border-[#D9D9D9] px-4 py-3">업로드 취소 후 다시 시작</button>}
      <button type="button" disabled={busy} onClick={() => { void confirm().catch(() => { setStage("error"); setMessage("제출 결과를 확인하지 못했습니다. 다시 시도해 주세요."); }); }} className="rounded border border-[#D9D9D9] px-4 py-3">제출 결과 새로 확인</button>
    </div>
  </section>;
}
