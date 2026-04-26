/**
 * 보고서 양식 — 행 액션 (수정·비공개 버튼)
 *
 * 역할: 관리자 양식 목록의 각 행에 표시되는 수정/비공개 컨트롤.
 *       "비공개"는 published=false로 전환하며, content/ 시드 fallback도 함께 차단된다.
 */
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EyeOff } from "lucide-react";
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleUnpublish = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await deleteReportTemplate(id);
      if (result.success) {
        setIsOpen(false);
        router.refresh();
        return;
      }
      setErrorMessage(result.message);
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

      <Dialog
        open={isOpen}
        onOpenChange={(next) => {
          setIsOpen(next);
          if (!next) setErrorMessage(null);
        }}
      >
        <DialogTrigger render={<Button variant="destructive" size="sm" />}>
          <EyeOff className="size-3.5" />
          비공개
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>이 양식을 비공개로 전환할까요?</DialogTitle>
            <DialogDescription>
              회원 페이지에서 즉시 사라집니다. 수정 페이지에서 언제든 다시 공개할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          {errorMessage ? (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              취소
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={handleUnpublish}
            >
              {isPending ? "처리 중..." : "비공개 전환"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
