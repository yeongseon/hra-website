"use client";

/**
 * 수료생 이야기 목록에서 클릭마다 상단 고정을 반전한다.
 * 실패 안내를 유지하며 성공한 요청에서만 목록을 갱신한다.
 */

import { useState, useTransition } from "react";
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
  const [errorMessage, setErrorMessage] = useState("");

  const handleClick = () => {
    startTransition(async () => {
      setErrorMessage("");
      try {
        const result = await toggleAlumniPin(id);
        if (!result.success) {
          setErrorMessage(result.message);
          return;
        }
        router.refresh();
      } catch {
        // 통신 예외의 SQL·개인정보는 표시하지 않고 안전한 재시도 안내를 사용한다.
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
