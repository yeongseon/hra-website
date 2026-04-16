/**
 * 갤러리 삭제 버튼 컴포넌트 (클라이언트 컴포넌트)
 *
 * 역할: 앨범을 삭제하는 버튼
 * - 삭제 확인 대화상자 표시
 * - 확인 후 서버 액션으로 앨범 삭제 처리
 *
 * 📌 클라이언트 컴포넌트 이유: 버튼 클릭, 대화상자 상태 관리 필요
 */

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
import { deleteGallery } from "@/features/gallery/actions";

type GalleryDeleteButtonProps = {
  id: string;
};

export function GalleryDeleteButton({ id }: GalleryDeleteButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger render={<Button variant="destructive" />}>
        <Trash2 className="mr-1 size-4" />
        삭제
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>앨범을 삭제할까요?</DialogTitle>
          <DialogDescription>
            앨범에 포함된 이미지도 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            취소
          </Button>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                // ⚙️ 서버 액션 호출 - 앨범 삭제 (포함된 이미지도 함께 삭제됨)
                await deleteGallery(id);
                setIsOpen(false);
                router.refresh(); // 페이지 새로고침 (목록 업데이트)
              });
            }}
          >
            삭제 진행
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
