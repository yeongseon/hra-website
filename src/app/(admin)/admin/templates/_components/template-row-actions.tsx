/**
 * 보고서 양식 — 행 액션 (수정·삭제 버튼)
 *
 * 역할: 관리자 양식 목록의 각 행에 표시되는 수정/삭제 컨트롤.
 *       삭제는 확인 다이얼로그 후 서버 액션을 호출한다.
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
import { deleteReportTemplate } from "@/features/report-templates/actions";

type Props = {
  id: string;
};

export function TemplateRowActions({ id }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteReportTemplate(id);
      if (result.success) {
        setIsOpen(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        render={<Link href={`/admin/templates/${id}/edit`} />}
      >
        수정
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger render={<Button variant="destructive" size="sm" />}>
          <Trash2 className="size-3.5" />
          삭제
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>양식을 삭제할까요?</DialogTitle>
            <DialogDescription>
              삭제 후에는 복구할 수 없습니다. 회원 페이지에서 즉시 사라집니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              취소
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={handleDelete}
            >
              {isPending ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
