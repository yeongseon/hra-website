/**
 * 관리자 전용 로그인 페이지
 * 일반 사용자 로그인(/login)과 분리된 credentials 전용 페이지
 */

import { Suspense } from "react";
import { AdminLoginForm } from "./admin-login-form";

export const metadata = {
  title: "관리자 로그인",
};

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Suspense
          fallback={
            <div className="rounded-lg border border-slate-700 bg-slate-900 p-8 text-center text-slate-400">
              로딩 중...
            </div>
          }
        >
          <AdminLoginForm />
        </Suspense>
      </div>
    </div>
  );
}
