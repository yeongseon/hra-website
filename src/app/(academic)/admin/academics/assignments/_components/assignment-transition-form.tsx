"use client";
/** 공개와 종료의 요청 키를 재시도 중 보존한다. 공개 확인값은 서버가 계산한 미리보기 원문만 보낸다. */
import Link from "next/link";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { preserveAssignmentForm } from "./preserve-assignment-form";
import { closeAssignment, publishAssignment } from "@/features/academics/assignments/actions";
import type { AssignmentPublishPreview } from "@/features/academics/assignments/admin-queries";

type TransitionProps = { assignmentId: string; requestId: string; writable: boolean } & (
  { kind: "publish"; preview: AssignmentPublishPreview } | { kind: "close" }
);
type TransitionState = { error?: string; success?: boolean; targetCount?: number };

export function AssignmentTransitionForm(props: TransitionProps) {
  const router = useRouter();
  const [state, action, pending] = useActionState<TransitionState, FormData>(async () => {
    try {
      const input = { assignmentId: props.assignmentId, requestId: props.requestId };
      const result = props.kind === "publish"
        ? await publishAssignment({ ...input, expectedUpdatedAt: props.preview.expectedUpdatedAt,
          expectedTargetFingerprint: props.preview.expectedTargetFingerprint })
        : await closeAssignment(input);
      if (!result.success) return { error: result.message };
      router.refresh();
      return { success: true, targetCount: result.targetCount };
    } catch {
      // 통신 오류 이후에도 같은 요청 키로 재시도하여 이미 확정된 결과를 안전하게 재조회한다.
      return { error: "처리 결과를 확인하지 못했습니다. 같은 화면에서 다시 시도해 주세요." };
    }
  }, {});
  const publish = props.kind === "publish";
  if (state.success) return <div className="space-y-3">
    <p role="status">{publish ? "과제가 공개되었습니다." : "과제가 종료되었습니다."} 확정 대상 {state.targetCount}명.</p>
    <Link href={`/admin/academics/assignments/${props.assignmentId}`} className="text-[#2563EB] underline">과제 상세 확인</Link>
  </div>;

  return (
    // 오류 결과도 React 액션 완료로 처리되므로 자동 초기화를 막아 동일 요청의 확인 상태를 보존한다.
    <form action={action} ref={preserveAssignmentForm} className="space-y-4 rounded border border-[#D9D9D9] p-5">
      {!props.writable && <p role="status">현재 과제 변경이 중지되어 있습니다. 조회만 이용할 수 있습니다.</p>}
      <fieldset disabled={pending || !props.writable} className="space-y-4 disabled:opacity-60">
        <div className="flex items-start gap-2">
          <input id="assignment-transition-confirm" type="checkbox" required className="mt-1 h-5 w-5" />
          <label htmlFor="assignment-transition-confirm">
            {publish ? "대상 기수·명부 건수와 마감을 확인했으며, 공개 후에는 과제를 수정할 수 없음을 확인했습니다."
              : "과제를 종료하면 학생의 추가 제출을 받을 수 없음을 확인했습니다."}
          </label>
        </div>
        <button type="submit" className="rounded bg-[#1a1a1a] px-5 py-2 text-white">
          {pending ? "처리 중…" : publish ? "확인한 대상으로 공개" : "과제 종료"}
        </button>
      </fieldset>
      {state.error && <div className="space-y-2">
        <p role="alert" className="text-red-700">{state.error}</p>
        {publish && <button type="button" onClick={() => router.refresh()} className="text-[#2563EB] underline">최신 대상으로 다시 확인</button>}
      </div>}
    </form>
  );
}
