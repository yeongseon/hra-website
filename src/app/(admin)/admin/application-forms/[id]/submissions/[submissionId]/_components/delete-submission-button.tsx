/**
 * 제출된 지원서(개인정보) 삭제 버튼 — 관리자 상세 페이지 헤더에서 호출.
 *
 * 개인정보보호법 §36 대응 UI 진입점:
 * 지원자 삭제 요청 시 관리자가 안전한 표준 경로로 삭제를 수행하도록,
 * DB 콘솔 직접 접근 대신 확인 다이얼로그를 통과한 후 서버 액션을 호출합니다.
 *
 * 서버 액션(`deleteApplicationSubmission`)이 감사 로그를 남기고 삭제 후에는
 * 목록 페이지로 이동합니다.
 */
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
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
import { deleteApplicationSubmission } from "@/features/applications/actions/submissions";

type DeleteSubmissionButtonProps = {
  submissionId: string;
  formId: string;
  applicantName: string;
};

export function DeleteSubmissionButton({
  submissionId,
  formId,
  applicantName,
}: DeleteSubmissionButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteApplicationSubmission(submissionId);
      if (result.success) {
        toast.success(result.message);
        setIsOpen(false);
        router.push(`/admin/application-forms/${formId}/submissions`);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
        <Trash2 className="size-3.5" />
        삭제
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>지원서를 삭제할까요?</DialogTitle>
          <DialogDescription>
            <strong>{applicantName}</strong> 님의 지원서와 모든 답변이 영구적으로
            삭제됩니다. 개인정보보호법상 삭제 요구권 대응 등 정당한 사유가 있는
            경우에만 진행해주세요. 이 작업은 되돌릴 수 없습니다.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isPending}>
            취소
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
            {isPending ? "삭제 중..." : "삭제"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
