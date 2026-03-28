/**
 * 404 페이지 — 존재하지 않는 페이지에 접근했을 때 표시됩니다.
 * Next.js App Router에서 자동으로 이 파일을 404 페이지로 사용합니다.
 */

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4 text-center text-white">
      <h1 className="text-6xl font-bold tracking-tight sm:text-8xl">404</h1>
      <p className="mt-4 text-lg text-gray-400 sm:text-xl">
        요청하신 페이지를 찾을 수 없습니다.
      </p>
      <p className="mt-2 text-sm text-gray-500">
        주소가 잘못되었거나, 페이지가 이동/삭제되었을 수 있습니다.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-md bg-white/10 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/20"
      >
        홈으로 돌아가기
      </Link>
    </div>
  );
}
