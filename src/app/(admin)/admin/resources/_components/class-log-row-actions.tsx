/**
 * 수업일지 행 액션 컴포넌트 (클라이언트 컴포넌트)
 *
 * 역할: 각 수업일지 행의 우측에 표시되는 "수정", "삭제" 버튼
 * - 수정 버튼: 수정 페이지로 이동
 * - 삭제 버튼: 확인 대화상자 표시 후 삭제 처리
 *
 * 📌 클라이언트 컴포넌트 이유: 버튼 클릭, 대화상자 상태 관리 필요
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
import { deleteClassLog } from "@/features/class-logs/actions";

type ClassLogRowActionsProps = {
  id: string;
};

export function ClassLogRowActions({ id }: ClassLogRowActionsProps) {
  const router = useRouter();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" render={<Link href={`/admin/resources/${id}/edit`} />}>
        수정
      </Button>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogTrigger render={<Button variant="destructive" size="sm" />}>
          <Trash2 className="size-3.5" />
          삭제
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>수업일지를 삭제할까요?</DialogTitle>
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
                startTransition(async () => {
                  // ⚙️ 서버 액션 호출 - 수업일지 삭제 요청
                  const result = await deleteClassLog(id);
                  if (result.success) {
                    setIsDeleteOpen(false);
                    router.refresh(); // 페이지 새로고침 (목록 업데이트)
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
