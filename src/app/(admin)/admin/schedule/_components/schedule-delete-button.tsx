"use client";

/**
 * 관리자 일정 목록에서 삭제 액션의 결과를 표시하는 폼이다.
 * 과제 참조로 삭제가 거부되면 한국어 이유를 알리고, 처리 중에는 중복 제출을 막는다.
 */
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { deleteScheduleEvent, type ScheduleActionState } from "@/features/schedule/actions";

const initialState: ScheduleActionState = { success: false, message: "" };

export function ScheduleDeleteButton({ id }: { id: string }) {
  // 서버가 반환한 실패는 그대로 안내하고, 통신 예외는 원문 없이 재시도를 안내한다.
  const [state, formAction, isPending] = useActionState(async () => {
    try {
      return await deleteScheduleEvent(id);
    } catch {
      return { success: false, message: "삭제 요청을 완료하지 못했습니다. 잠시 후 다시 시도해주세요." };
    }
  }, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <Button type="submit" variant="destructive" disabled={isPending}>
        {isPending ? "삭제 중..." : "삭제"}
      </Button>
      {!state.success && state.message && (
        <p role="alert" className="max-w-xs text-left text-sm text-red-600">
          {state.message}
        </p>
      )}
    </form>
  );
}
