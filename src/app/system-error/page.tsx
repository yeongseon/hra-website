export default function SystemErrorPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-slate-900">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-bold">일시적인 문제가 발생했습니다</h1>
        <p className="mt-4 text-sm text-slate-600">
          현재 요청을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <a
            href="/login"
            className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700"
          >
            로그인 페이지로 이동
          </a>
          <a
            href="/"
            className="rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-900 hover:bg-slate-100"
          >
            홈으로 돌아가기
          </a>
        </div>
      </div>
    </main>
  );
}
