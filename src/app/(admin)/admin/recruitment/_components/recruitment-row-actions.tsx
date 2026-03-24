/**
 * 모집 행 액션 컴포넌트 (클라이언트 컴포넌트)
 *
 * 역할: 각 기수 행의 우측에 표시되는 액션 버튼/드롭다운
 * - 모집 상태 드롭다운: 상태 변경 (UPCOMING → OPEN → CLOSED)
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
    // ⚙️ 서버 액션 호출 - 기수의 모집 상태 변경
    startTransition(async () => {
      await updateRecruitmentStatus(id, status as "UPCOMING" | "OPEN" | "CLOSED");
      router.refresh(); // 페이지 새로고침 (상태 업데이트)
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
                // ⚙️ 서버 액션 호출 - 기수 삭제 (포함된 지원서도 함께 삭제됨)
                await deleteCohort(id);
                setIsDeleteOpen(false);
                router.refresh(); // 페이지 새로고침 (목록 업데이트)
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
