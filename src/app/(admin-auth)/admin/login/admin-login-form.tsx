"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function AdminLoginForm() {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const callbackUrl = searchParams.get("callbackUrl") || "/admin";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("이메일과 비밀번호를 입력해주세요");
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    if (result?.error) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다");
      setIsLoading(false);
    } else if (result?.url) {
      window.location.href = result.url;
    }
  };

  return (
    <Card className="border-slate-700 bg-slate-900">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl text-white">관리자 로그인</CardTitle>
        <p className="text-sm text-slate-400 mt-2">
          관리자 계정으로 로그인하세요
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-slate-300">
              이메일
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="border-slate-600 bg-slate-800 text-white placeholder:text-slate-500"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-300">
              비밀번호
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="비밀번호를 입력하세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              className="border-slate-600 bg-slate-800 text-white placeholder:text-slate-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-slate-700 py-3 min-h-[44px] text-white hover:bg-slate-600"
            size="lg"
          >
            {isLoading ? "로그인 중..." : "로그인"}
          </Button>
        </form>
        {/* 일반 회원의 소셜 로그인·가입 경로를 관리자 비밀번호 로그인과 구분한다. */}
        <div className="mt-6 border-t border-slate-700 pt-4 text-center">
          <Link
            href="/login"
            className="text-sm text-slate-300 underline underline-offset-4 hover:text-white"
          >
            일반 회원 로그인·회원가입
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
