"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteCohort, updateRecruitmentStatus } from "@/features/recruitment/actions";

type RecruitmentRowActionsProps = {
  id: string;
  currentStatus: "UPCOMING" | "OPEN" | "CLOSED";
};

export function RecruitmentRowActions({ id, currentStatus }: RecruitmentRowActionsProps) {
  const router = useRouter();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleStatusChange = (status: string | null) => {
    if (!status) return;
    startTransition(async () => {
      await updateRecruitmentStatus(id, status as "UPCOMING" | "OPEN" | "CLOSED");
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Select defaultValue={currentStatus} onValueChange={handleStatusChange} disabled={isPending}>
        <SelectTrigger className="h-8 w-[130px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="UPCOMING">UPCOMING</SelectItem>
          <SelectItem value="OPEN">OPEN</SelectItem>
          <SelectItem value="CLOSED">CLOSED</SelectItem>
        </SelectContent>
      </Select>

      <Button variant="outline" size="sm" render={<Link href={`/admin/recruitment/${id}/edit`} />}>
        수정
      </Button>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogTrigger render={<Button variant="destructive" size="sm" />}>
          <Trash2 className="size-3.5" />
          삭제
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>기수를 삭제할까요?</DialogTitle>
            <DialogDescription>
              해당 기수의 지원서도 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
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
                startTransition(async () => {
                  await deleteCohort(id);
                  setIsDeleteOpen(false);
                  router.refresh();
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
