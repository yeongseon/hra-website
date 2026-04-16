"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pin, PinOff, Trash2 } from "lucide-react";
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
import { deleteNotice, togglePin, toggleStatus } from "@/features/notices/actions";

type NoticeRowActionsProps = {
  id: string;
  pinned: boolean;
  status: "DRAFT" | "PUBLISHED";
};

export function NoticeRowActions({ id, pinned, status }: NoticeRowActionsProps) {
  const router = useRouter();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const runAction = (action: () => Promise<{ success: boolean }>) => {
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        router.refresh();
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" render={<Link href={`/admin/notices/${id}/edit`} />}>
        수정
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => runAction(() => togglePin(id))}
      >
        {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        {pinned ? "고정 해제" : "고정"}
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => runAction(() => toggleStatus(id))}
      >
        {status === "DRAFT" ? "게시" : "임시저장"}
      </Button>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogTrigger render={<Button variant="destructive" size="sm" />}>
          <Trash2 className="size-3.5" />
          삭제
        </DialogTrigger>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>공지사항을 삭제할까요?</DialogTitle>
            <DialogDescription>
              삭제 후에는 복구할 수 없습니다. 계속 진행하려면 삭제 버튼을 눌러주세요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
              취소
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => {
                runAction(async () => {
                  const result = await deleteNotice(id);
                  if (result.success) {
                    setIsDeleteOpen(false);
                  }
                  return result;
                });
              }}
            >
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
