"use client";
/** 초안 전용 폼. 요청 식별자를 재시도 동안 유지하고 선택한 기수의 수업·세션만 표시한다. */
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { preserveAssignmentForm } from "./preserve-assignment-form";
import { createAssignment, updateDraftAssignment } from "@/features/academics/assignments/actions";
import { assignmentKstInput } from "@/features/academics/assignments/admin-display";
import type { AssignmentFormOptions } from "@/features/academics/assignments/admin-queries";
import type { AssignmentMutationResult } from "@/features/academics/assignments/validation";
import { AcademicRequestReference } from "@/components/academics/request-reference";

type FormState = { error?: string; referenceId?: string };
export function AssignmentForm({ options, requestId, assignment, writable }: {
  options: AssignmentFormOptions; requestId: string;
  assignment?: AssignmentMutationResult["assignment"]; writable: boolean;
}) {
  const router = useRouter();
  // 액션이 오류 상태를 반환해도 React의 폼 초기화로 입력을 잃지 않도록 제어 입력으로 보존한다.
  const [title, setTitle] = useState(assignment?.title ?? "");
  const [instructions, setInstructions] = useState(assignment?.instructions ?? "");
  const [dueAtKst, setDueAtKst] = useState(assignmentKstInput(assignment?.dueAt ?? null));
  const [cohortId, setCohortId] = useState(assignment?.cohortId ?? "");
  const [eventId, setEventId] = useState(assignment?.scheduleEventId ?? "");
  const [sessionId, setSessionId] = useState(assignment?.scheduleSessionId ?? "");
  const [state, action, pending] = useActionState<FormState, FormData>(async (_previous, form) => {
    const fields = { requestId, cohortId: String(form.get("cohortId") ?? ""),
      scheduleEventId: String(form.get("scheduleEventId") ?? "") || null,
      scheduleSessionId: String(form.get("scheduleSessionId") ?? "") || null,
      title: String(form.get("title") ?? ""), instructions: String(form.get("instructions") ?? ""),
      dueAtKst: String(form.get("dueAtKst") ?? "") || null };
    try {
      const result = assignment
        ? await updateDraftAssignment({ ...fields, assignmentId: assignment.id, expectedUpdatedAt: assignment.updatedAt })
        : await createAssignment(fields);
      if (!result.success) return { error: result.message, referenceId: result.referenceId };
      router.replace(`/admin/academics/assignments/${result.assignment.id}`);
      router.refresh();
      return {};
    } catch {
      return { error: "처리 결과를 확인하지 못했습니다. 같은 화면에서 다시 시도해 주세요." };
    }
  }, {});
  const inputClass = "w-full rounded border border-[#D9D9D9] p-2";

  return (
    <form action={action} ref={preserveAssignmentForm} className="max-w-2xl space-y-5">
      {!writable && <p role="status">현재 과제 변경이 중지되어 있습니다. 조회만 이용할 수 있습니다.</p>}
      <fieldset disabled={pending || !writable} className="space-y-5 disabled:opacity-60">
        <div className="space-y-1">
          <label htmlFor="assignment-cohort" className="block">대상 기수</label>
          <select id="assignment-cohort" name="cohortId" className={inputClass} value={cohortId} required
            onChange={event => { setCohortId(event.target.value); setEventId(""); setSessionId(""); }}>
            <option value="" disabled>기수를 선택해 주세요</option>
            {options.cohorts.map(cohort => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="assignment-event" className="block">연결 수업</label>
          <select id="assignment-event" name="scheduleEventId" className={inputClass} value={eventId}
            onChange={event => { setEventId(event.target.value); setSessionId(""); }}>
            <option value="">수업 연결 안 함</option>
            {options.events.filter(event => event.cohortId === cohortId).map(event => <option key={event.id} value={event.id}>{event.title}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="assignment-session" className="block">연결 세부 수업</label>
          <select id="assignment-session" name="scheduleSessionId" className={inputClass} value={sessionId}
            onChange={event => setSessionId(event.target.value)}>
            <option value="">세부 수업 연결 안 함</option>
            {options.sessions.filter(session => session.eventId === eventId).map(session => <option key={session.id} value={session.id}>{session.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="assignment-title" className="block">과제 제목</label>
          <input id="assignment-title" name="title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={200} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="assignment-instructions" className="block">과제 안내</label>
          <textarea id="assignment-instructions" name="instructions" value={instructions} onChange={event => setInstructions(event.target.value)}
            maxLength={50000} rows={10} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="assignment-due" className="block">마감 일시 (한국시간)</label>
          <input id="assignment-due" name="dueAtKst" type="datetime-local" step={1}
            value={dueAtKst} onChange={event => setDueAtKst(event.target.value)} className={inputClass} aria-describedby="assignment-due-help" />
          <p id="assignment-due-help" className="text-sm text-[#666666]">한국시간 기준입니다. 초안은 마감 없이 저장할 수 있으며 공개하려면 미래 마감이 필요합니다.</p>
        </div>
        <p className="text-sm text-[#666666]">저장하면 초안 상태로 유지됩니다. 공개 전 대상 명부를 별도로 확인합니다.</p>
        <button type="submit" className="rounded bg-[#1a1a1a] px-5 py-2 text-white">{pending ? "저장 중…" : assignment ? "초안 수정 저장" : "초안 저장"}</button>
      </fieldset>
      {state.error && <div role="alert" className="space-y-1 text-red-700"><p>{state.error}</p><AcademicRequestReference referenceId={state.referenceId} /></div>}
    </form>
  );
}
