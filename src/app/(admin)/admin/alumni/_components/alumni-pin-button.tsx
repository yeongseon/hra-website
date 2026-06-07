"use client";

// 수료생 이야기 목록 행의 상단 고정 토글 버튼
// 클릭 시 toggleAlumniPin 서버 액션을 호출하고 페이지를 갱신한다.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pin } from "lucide-react";
import { toggleAlumniPin } from "@/features/alumni/actions";
import { cn } from "@/lib/utils";

type AlumniPinButtonProps = {
  id: string;
  pinned: boolean;
};

export function AlumniPinButton({ id, pinned }: AlumniPinButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      await toggleAlumniPin(id);
      router.refresh();
    });
  };

  return (
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
  );
}
