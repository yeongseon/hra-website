/**
 * 로그인 페이지 (서버 컴포넌트)
 *
 * 서버에서 enabledProviders를 읽어 클라이언트 LoginForm에 전달합니다.
 * 환경변수가 없는 소셜 로그인 버튼은 자동으로 숨겨집니다.
 */

import { enabledProviders } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <Card className="border-slate-700 bg-slate-900">
          <CardContent className="p-8 text-center text-slate-400">
            로딩 중...
          </CardContent>
        </Card>
      }
    >
      <LoginForm enabledProviders={enabledProviders} />
    </Suspense>
  );
}
