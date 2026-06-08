/**
 * 지원서 양식 행 액션 컴포넌트
 */
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Edit, ListChecks, Eye, EyeOff } from "lucide-react";
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
import { toast } from "sonner";
import { deleteForm, toggleFormPublishStatus } from "@/features/applications/actions/forms";

type FormRowActionsProps = {
  id: string;
  isPublished: boolean;
};

export function FormRowActions({ id, isPublished }: FormRowActionsProps) {
  const router = useRouter();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleTogglePublish = () => {
    startTransition(async () => {
      const result = await toggleFormPublishStatus(id, !isPublished);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteForm(id);
      if (result.success) {
        toast.success(result.message);
        setIsDeleteOpen(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleTogglePublish}
        disabled={isPending}
        title={isPublished ? "비공개로 전환" : "공개로 전환"}
      >
        {isPublished ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </Button>

      <Button variant="outline" size="sm" render={<Link href={`/admin/application-forms/${id}`} />}>
        질문 편집
      </Button>

      <Button variant="outline" size="sm" render={<Link href={`/admin/application-forms/${id}/submissions`} />}>
        제출 내역
      </Button>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogTrigger render={<Button variant="destructive" size="sm" />}>
          <Trash2 className="size-3.5" />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>지원서 양식을 삭제할까요?</DialogTitle>
            <DialogDescription>
              이 양식과 관련된 모든 질문 및 제출된 지원서 데이터가 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
              취소
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={handleDelete}
            >
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
