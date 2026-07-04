/**
 * 제출된 지원서 처리 상태 변경 버튼 — 관리자 상세 페이지 헤더에서 호출.
 *
 * 관리자가 지원서를 검토한 후 합격/불합격/재검토 상태를 반영하는 표준 UI 경로.
 * 확인 다이얼로그로 실수를 방지하고 서버 액션(`updateSubmissionStatus`)이
 * 감사 로그와 revalidatePath 를 처리합니다.
 */
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateSubmissionStatus } from "@/features/applications/actions/submissions";

type SubmissionStatus = "PENDING" | "ACCEPTED" | "REJECTED";

type StatusChangeButtonProps = {
  submissionId: string;
  currentStatus: SubmissionStatus;
};

const STATUS_META: Record<
  SubmissionStatus,
  { label: string; className: string; dotClassName: string }
> = {
  PENDING: {
    label: "검토 대기",
    className: "bg-slate-200 text-slate-700 hover:bg-slate-300",
    dotClassName: "bg-slate-400",
  },
  ACCEPTED: {
    label: "합격",
    className: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
    dotClassName: "bg-emerald-500",
  },
  REJECTED: {
    label: "불합격",
    className: "bg-red-100 text-red-700 hover:bg-red-200",
    dotClassName: "bg-red-500",
  },
};

const STATUS_ORDER: SubmissionStatus[] = ["PENDING", "ACCEPTED", "REJECTED"];

export function StatusChangeButton({
  submissionId,
  currentStatus,
}: StatusChangeButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  // 개별 버튼의 "변경 중..." 라벨을 표시하기 위한 상태.
  // 전체 disabled 는 isPending 으로 처리하되, 어느 버튼이 트리거되었는지는 이 값으로 구분.
  const [pendingStatus, setPendingStatus] = useState<SubmissionStatus | null>(
    null
  );

  const handleChange = (newStatus: SubmissionStatus) => {
    if (newStatus === currentStatus) {
      return;
    }
    setPendingStatus(newStatus);
    startTransition(async () => {
      const result = await updateSubmissionStatus(submissionId, newStatus);
      if (result.success) {
        toast.success(result.message);
        setIsOpen(false);
        // revalidatePath 로 서버 데이터는 갱신되지만, 브라우저 라우터 캐시도
        // 즉시 재조회하도록 refresh() 호출 (Delete 버튼 패턴과 동일).
        router.refresh();
      } else {
        toast.error(result.message);
      }
      setPendingStatus(null);
    });
  };

  const currentMeta = STATUS_META[currentStatus];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={`${currentMeta.className} border-transparent`}
          />
        }
      >
        {currentMeta.label} · 변경
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>지원서 상태 변경</DialogTitle>
          <DialogDescription>
            현재 상태는 <strong>{currentMeta.label}</strong> 입니다. 변경할
            상태를 선택하세요. 이 결정은 감사 로그에 기록됩니다.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-2">
          {STATUS_ORDER.map((status) => {
            const meta = STATUS_META[status];
            const isCurrent = status === currentStatus;
            const isThisPending = pendingStatus === status;
            return (
              <Button
                key={status}
                type="button"
                variant="outline"
                className={`justify-start ${isCurrent ? "opacity-60" : ""}`}
                disabled={isCurrent || isPending}
                onClick={() => handleChange(status)}
              >
                <span
                  className={`inline-flex size-2 rounded-full ${meta.dotClassName}`}
                />
                <span className="ml-2">
                  {meta.label}
                  {isCurrent ? " (현재)" : ""}
                </span>
                {isThisPending && (
                  <span className="ml-auto text-xs text-slate-500">
                    변경 중...
                  </span>
                )}
              </Button>
            );
          })}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isPending}
          >
            취소
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
