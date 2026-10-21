"use client";

/**
 * 공지 목록 행에서 클릭마다 고정을 반전하는 버튼이다.
 * 성공하면 목록을 갱신하고, 서버 거부·통신 실패는 한국어로 안내해 재시도를 허용한다.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pin } from "lucide-react";
import { togglePin } from "@/features/notices/actions";
import { cn } from "@/lib/utils";

type NoticePinButtonProps = {
  id: string;
  pinned: boolean;
};

export function NoticePinButton({ id, pinned }: NoticePinButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  const handleClick = () => {
    startTransition(async () => {
      setErrorMessage("");
      try {
        const result = await togglePin(id);
        if (!result.success) {
          setErrorMessage(result.message);
          return;
        }
        router.refresh();
      } catch {
        // 예외 원문에는 내부 정보가 포함될 수 있어 고정된 안내만 표시한다.
        setErrorMessage("고정 상태를 변경하지 못했습니다. 잠시 후 다시 시도해주세요.");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        title={pinned ? "고정 해제" : "상단 고정"}
        className={cn(
          "rounded-md p-1.5 transition-colors",
          pinned
            ? "text-amber-500 hover:bg-amber-50"
            : "text-slate-300 hover:bg-slate-100 hover:text-slate-500",
          isPending && "cursor-not-allowed opacity-50"
        )}
      >
        <Pin className={cn("size-4", pinned && "fill-amber-500")} />
      </button>
      {errorMessage && <p role="alert" className="max-w-xs text-sm text-red-600">{errorMessage}</p>}
    </>
  );
}
