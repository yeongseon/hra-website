"use client";

import { useEffect } from "react";
import Link from "next/link";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AdminError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[admin] 페이지 렌더링 오류:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 text-slate-900">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-bold">문제가 발생했습니다</h1>
        <p className="mt-4 text-sm text-slate-600">
          요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-slate-400">오류 ID: {error.digest}</p>
        )}
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700"
          >
            다시 시도
          </button>
          <Link
            href="/admin"
            className="rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-900 hover:bg-slate-100"
          >
            관리자 홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
