"use client";

import { useState, useTransition } from "react";
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
import { deleteClassMaterial } from "@/features/class-materials/actions";

type ClassMaterialRowActionsProps = {
  id: string;
};

export function ClassMaterialRowActions({ id }: ClassMaterialRowActionsProps) {
  const router = useRouter();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
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
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
            취소
          </Button>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                const result = await deleteClassMaterial(id);
                if (result.success) {
                  setIsDeleteOpen(false);
                  router.refresh();
                }
              });
            }}
          >
            삭제
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
