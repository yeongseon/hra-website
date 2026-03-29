"use client";

import { useEffect } from "react";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function RootError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[root] 페이지 렌더링 오류:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-white">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-bold">문제가 발생했습니다</h1>
        <p className="mt-4 truncate text-sm text-zinc-300">{error.message}</p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
          >
            다시 시도
          </button>
          <a
            href="/"
            className="rounded-md border border-white/20 px-4 py-2 font-medium text-white hover:bg-white/10"
          >
            홈으로 돌아가기
          </a>
        </div>
      </div>
    </div>
  );
}
