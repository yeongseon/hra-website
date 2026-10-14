/**
 * 모집 행 액션 컴포넌트 (클라이언트 컴포넌트)
 *
 * 역할: 각 기수 행의 우측에 표시되는 액션 버튼/드롭다운
 * - 모집 상태 드롭다운: 상태 변경 (예정 → 모집중 → 마감)
 * - 수정 버튼: 수정 페이지로 이동
 * - 삭제 버튼: 확인 대화상자 표시 후 삭제 처리
 *
 * 📌 클라이언트 컴포넌트 이유: 드롭다운 상태, 버튼 클릭, 대화상자 관리 필요
 */

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
import { deleteCohort } from "@/features/recruitment/actions";

type RecruitmentRowActionsProps = {
  id: string;
};

export function RecruitmentRowActions({ id }: RecruitmentRowActionsProps) {
  const router = useRouter();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-end gap-2">
      <Button variant="outline" size="sm" render={<Link href={`/admin/recruitment/${id}/edit`} />}>
        수정
      </Button>

      <Dialog open={isDeleteOpen} onOpenChange={(open) => {
        setIsDeleteOpen(open);
        if (!open) setDeleteError(null);
      }}>
        <DialogTrigger render={<Button variant="destructive" size="sm" />}>
          <Trash2 className="size-3.5" />
          삭제
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>기수를 삭제할까요?</DialogTitle>
            <DialogDescription>
              지원서가 연결된 기수는 삭제할 수 없습니다. 삭제한 기수는 복구할 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? <p role="alert" className="text-sm text-destructive">{deleteError}</p> : null}
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
                  const result = await deleteCohort(id);
                  if (!result.success) {
                    setDeleteError(result.message);
                    return;
                  }
                  setIsDeleteOpen(false);
                  router.refresh();
                } catch {
                  setDeleteError("기수 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
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
