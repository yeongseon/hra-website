"use client";
/** 요청 UUID를 제출 후에도 유지하여 재시도 시 명부가 중복 생성되지 않도록 하는 등록 폼이다. */
import { useActionState, useState } from "react";
import { registerStudent } from "@/features/academics/roster/actions";
import type { RosterFormState } from "@/features/academics/roster/input";
import { AcademicRequestReference } from "@/components/academics/request-reference";

export function RosterForm({ cohorts, requestId, studentId }: {
  cohorts: { id: string; name: string }[]; requestId: string; studentId?: string;
}) {
  const [existing, setExisting] = useState(Boolean(studentId));
  const [state, action, pending] = useActionState<RosterFormState, FormData>(registerStudent, {});
  const inputClass = "w-full rounded border border-[#D9D9D9] p-2";

  return (
    <form action={action} className="max-w-xl space-y-5">
      <input type="hidden" name="requestId" value={requestId} />
      <div className="space-y-1">
        <label htmlFor="roster-registration-type" className="block">등록 유형</label>
        <select id="roster-registration-type" className={inputClass} value={existing ? "existing" : "new"}
          onChange={event => setExisting(event.target.value === "existing")}>
          <option value="new">신규 학생 등록</option>
          <option value="existing">기존 학생의 기수 추가</option>
        </select>
      </div>
      {existing ? (
        <div className="space-y-1">
          <label htmlFor="roster-student-id" className="block">기존 학생 식별자</label>
          <input id="roster-student-id" className={inputClass} name="studentId" defaultValue={studentId}
            required placeholder="학생 상세에 표시된 식별자" />
        </div>
      ) : (
        <div className="space-y-1">
          <label htmlFor="roster-display-name" className="block">표시 이름</label>
          <input id="roster-display-name" className={inputClass} name="displayName" maxLength={100} required />
        </div>
      )}
      <p className="text-sm text-[#666666]">
        같은 이름만으로 동일인을 판단하지 않습니다. 재등록은 기존 학생 상세에서 식별자를 확인해 주세요.
      </p>
      <div className="space-y-1">
        <label htmlFor="roster-cohort" className="block">등록할 기수</label>
        <select id="roster-cohort" className={inputClass} name="cohortId" required defaultValue="">
          <option value="" disabled>기수를 선택해 주세요</option>
          {cohorts.map(cohort => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="roster-verification" className="block">본인 확인 방식</label>
        <select id="roster-verification" name="verificationMethod" className={inputClass} required defaultValue="">
          <option value="" disabled>확인 방식을 선택해 주세요</option>
          <option value="IN_PERSON">대면 확인</option>
          <option value="VERIFIED_CONTACT">검증된 연락 경로 확인</option>
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="roster-evidence" className="block">승인 근거 참조 식별자</label>
        <input id="roster-evidence" className={inputClass} name="evidenceReference" required aria-describedby="evidence-help" />
      </div>
      <p id="evidence-help" className="text-sm text-[#666666]">
        운영자가 별도로 관리하는 확인 기록의 식별자(UUID)를 입력하세요. 증빙 원문·전화번호·이메일은 입력하지 마세요.
      </p>
      {state.error && <div role="alert" className="space-y-1 text-red-700"><p>{state.error}</p><AcademicRequestReference referenceId={state.referenceId} /></div>}
      <button type="submit" disabled={pending || !cohorts.length}
        className="rounded bg-[#1a1a1a] px-5 py-2 text-white disabled:opacity-50">
        {pending ? "등록 중…" : "등록 승인"}
      </button>
      {!cohorts.length && <p>등록할 기수가 없습니다. 먼저 기수 정보를 확인해 주세요.</p>}
    </form>
  );
}
