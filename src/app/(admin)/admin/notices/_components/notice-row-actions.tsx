/**
 * 공지사항 행 액션 컴포넌트 (NoticeRowActions)
 * 
 * 클라이언트 컴포넌트 — 각 공지사항 행의 액션 버튼들을 관리합니다.
 * _components 폴더: 이 컴포넌트는 notices/page.tsx 테이블에서만 사용됩니다.
 * 
 * 기능:
 * - "수정" 버튼: /admin/notices/[id]/edit 페이지로 이동
 * - "고정/고정해제" 버튼: togglePin 서버 액션 실행 (상태 토글)
 * - "게시/임시저장" 버튼: toggleStatus 서버 액션 실행 (상태 토글)
 * - "삭제" 버튼: 확인 대화상자 후 deleteNotice 서버 액션 실행
 * 
 * "use client" 필수 — 버튼 클릭, 상태 관리, 확인 대화상자 등
 * 모두 클라이언트 인터랙션이 필요하므로 클라이언트 컴포넌트입니다.
 */

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
  slug: string;
  pinned: boolean;
  status: "DRAFT" | "PUBLISHED";
};

export function NoticeRowActions({ slug, pinned, status }: NoticeRowActionsProps) {
  const router = useRouter();
  // useState — 삭제 확인 대화상자 열림/닫힘 상태 관리
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  // useTransition — 서버 액션 실행 중 상태 추적 (로딩 중 버튼 비활성화 등)
  // isPending — 서버 액션 실행 중이면 true
  const [isPending, startTransition] = useTransition();

  /**
   * 서버 액션 실행 함수
   * 액션이 성공하면 페이지 새로고침해서 최신 데이터 표시
   */
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
      {/* 수정 버튼 — 수정 페이지로 이동 */}
      <Button variant="outline" size="sm" render={<Link href={`/admin/notices/${slug}/edit`} />}>
        수정
      </Button>
      
      {/* 고정/고정해제 버튼 — togglePin 액션 실행 */}
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => runAction(() => togglePin(slug))}
      >
        {/* 현재 고정 상태에 따라 아이콘과 텍스트 변경 */}
        {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        {pinned ? "고정 해제" : "고정"}
      </Button>
      
      {/* 게시/임시저장 버튼 — toggleStatus 액션 실행 */}
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => runAction(() => toggleStatus(slug))}
      >
        {/* 현재 상태에 따라 텍스트 변경 */}
        {status === "DRAFT" ? "게시" : "임시저장"}
      </Button>

      {/* 삭제 버튼 — 확인 대화상자 표시 */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogTrigger render={<Button variant="destructive" size="sm" />}>
          <Trash2 className="size-3.5" />
          삭제
        </DialogTrigger>
        
        {/* 삭제 확인 대화상자 */}
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
            {/* 삭제 버튼 — 삭제 액션 실행 후 대화상자 닫기 */}
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => {
                runAction(async () => {
                  const result = await deleteNotice(slug);
                  // 성공 시 대화상자 닫기
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
