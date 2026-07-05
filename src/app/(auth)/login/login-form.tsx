"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface LoginFormProps {
  enabledProviders: {
    google: boolean;
    kakao: boolean;
  };
}

/**
 * 일반 사용자 로그인 폼 — 소셜 로그인(카카오/구글)만 제공
 * 관리자 로그인은 /admin/login 에서 별도로 처리
 */
export function LoginForm({ enabledProviders }: LoginFormProps) {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  // signIn 콜백이 URL 문자열을 반환하면 next-auth 가 `?error=...` 를 붙여 이 페이지로 돌려보낸다.
  // #67 에서 OAuth 자동 계정 병합을 차단하면서 `OAuthAccountNotLinked` 코드를 함께 전달한다.
  // 로컬 계정 차단 / 다른 provider 매칭 실패 두 경우 모두 같은 코드로 통합해 문구를 일반화한다
  // (email enumeration 완화).
  const authError = searchParams.get("error");

  const handleSocialLogin = async (provider: "google" | "kakao") => {
    setIsLoading(provider);
    await signIn(provider, { callbackUrl });
  };

  const hasAnySocial = enabledProviders.google || enabledProviders.kakao;

  if (!hasAnySocial) {
    return (
      <Card className="border-slate-700 bg-slate-900">
        <CardContent className="p-8 text-center text-slate-400">
          현재 소셜 로그인이 설정되어 있지 않습니다.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-700 bg-slate-900">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl text-white">로그인</CardTitle>
        <p className="text-sm text-slate-400 mt-2">
          {enabledProviders.kakao
            ? "카카오톡으로 간편하게 로그인하세요"
            : "소셜 계정으로 로그인하세요"}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {authError === "OAuthAccountNotLinked" && (
          <div
            role="alert"
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
          >
            이 소셜 계정으로는 로그인할 수 없습니다. 기존에 사용하던 로그인 방법을
            이용하거나 관리자에게 문의해 주세요.
          </div>
        )}

        {enabledProviders.kakao && (
          <button
            type="button"
            onClick={() => handleSocialLogin("kakao")}
            disabled={isLoading !== null}
            className="w-full flex items-center justify-center gap-3 rounded-md bg-[#FEE500] px-4 py-4 min-h-[52px] text-base font-semibold text-[#191919] shadow-sm hover:bg-[#FDD800] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="#191919" aria-hidden="true">
              <path d="M12 3C6.477 3 2 6.463 2 10.691c0 2.72 1.8 5.108 4.512 6.467-.198.74-.716 2.68-.82 3.095-.127.506.186.499.39.363.16-.107 2.554-1.737 3.588-2.446.748.11 1.52.168 2.33.168 5.523 0 10-3.463 10-7.647C22 6.463 17.523 3 12 3z" />
            </svg>
            {isLoading === "kakao" ? "로그인 중..." : "카카오로 로그인"}
          </button>
        )}

        {enabledProviders.google && (
          <button
            type="button"
            onClick={() => handleSocialLogin("google")}
            disabled={isLoading !== null}
            className="w-full flex items-center justify-center gap-3 rounded-md border border-slate-600 bg-white px-4 py-3 min-h-[44px] text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            {isLoading === "google" ? "로그인 중..." : "구글로 로그인"}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
