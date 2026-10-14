"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
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
import { deleteClassMaterial } from "@/features/class-materials/actions";

type ClassMaterialRowActionsProps = {
  id: string;
};

export function ClassMaterialRowActions({ id }: ClassMaterialRowActionsProps) {
  const router = useRouter();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-end gap-2">
      <Button size="sm" variant="outline" render={<Link href={`/admin/resources/class-materials/${id}`} />}>
        <Pencil className="size-3.5" />
        수정
      </Button>
    <Dialog open={isDeleteOpen} onOpenChange={(open) => {
      setIsDeleteOpen(open);
      if (open) setDeleteError(null);
    }}>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
        <Trash2 className="size-3.5" />
        삭제
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>강의 자료를 삭제할까요?</DialogTitle>
          <DialogDescription>
            삭제 후에는 복구할 수 없으며 업로드된 파일도 함께 제거됩니다.
          </DialogDescription>
        </DialogHeader>
      {deleteError && <p role="alert" className="text-sm text-red-600">{deleteError}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
            취소
          </Button>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                setDeleteError(null);
                try {
                  const result = await deleteClassMaterial(id);
                  if (result.success) {
                    setIsDeleteOpen(false);
                    router.refresh();
                  } else {
                    setDeleteError(result.error ?? "강의 자료를 삭제하지 못했습니다.");
                  }
                } catch (error) {
                  console.error("강의 자료 삭제 실패:", error);
                  setDeleteError("강의 자료를 삭제하지 못했습니다. 다시 시도해 주세요.");
                }
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
