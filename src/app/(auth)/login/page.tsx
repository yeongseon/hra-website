/**
 * 로그인 페이지
 * 클라이언트 컴포넌트: 사용자가 이메일과 비밀번호를 입력하고 로그인할 수 있는 페이지입니다
 * - "use client"가 있으므로 브라우저에서 직접 실행되는 컴포넌트입니다
 * - useState를 사용해 입력값과 상태를 관리합니다
 * - NextAuth의 signIn() 함수를 사용해 실제 인증을 처리합니다
 */
"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

function LoginForm() {
  // useRouter: 페이지를 다른 곳으로 이동시키는 훅 (예: 로그인 후 홈으로 이동)
  const router = useRouter();
  // useSearchParams: URL에 붙은 파라미터를 읽는 훅 (예: ?callbackUrl=/member)
  const searchParams = useSearchParams();
  // useState 훅: 상태를 저장했다가 변경할 수 있는 기능 (값, 값을 바꾸는 함수)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // error: 에러 메시지를 저장 (예: "이메일이 틀렸습니다")
  const [error, setError] = useState("");
  // isLoading: 로그인 진행 중인지를 나타냄 (true면 진행 중, false면 완료)
  const [isLoading, setIsLoading] = useState(false);

  // handleSubmit: 폼이 제출될 때 실행되는 함수 (즉, 로그인 버튼을 클릭할 때)
  const handleSubmit = async (e: React.FormEvent) => {
    // e.preventDefault(): 폼의 기본 동작(페이지 새로고침)을 막음
    e.preventDefault();
    // 에러 메시지 초기화 (이전 오류 삭제)
    setError("");
    // 로그인 진행 중임을 표시
    setIsLoading(true);

    try {
      // signIn(): NextAuth가 제공하는 함수로 이메일/비밀번호로 로그인 시도
      // "credentials": 아이디/비밀번호 방식의 로그인을 의미
      // redirect: false는 자동 이동을 하지 말고, 결과만 받겠다는 뜻
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      // 만약 로그인에 실패했다면 (result?.error가 존재한다면)
      if (result?.error) {
        setError("이메일 또는 비밀번호가 올바르지 않습니다");
        // 비밀번호 필드를 비움 (보안 때문에)
        setPassword("");
      } 
      // 만약 로그인이 성공했다면
      else if (result?.ok) {
        // callbackUrl: 로그인 후 이동할 주소 (없으면 "/" 즉, 홈페이지)
        const callbackUrl = searchParams.get("callbackUrl") || "/";
        // router.push(): 그 주소로 이동
        router.push(callbackUrl);
      }
    } catch {
      // 예상치 못한 오류가 발생했을 때 (예: 네트워크 끊김)
      setError("오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      // try와 catch가 모두 끝난 후 무조건 실행됨
      // 로그인 진행 중 상태를 해제 (로딩 끝남)
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-slate-700 bg-slate-900">
      <CardHeader>
          <CardTitle className="text-2xl text-white">로그인</CardTitle>
      </CardHeader>
      <CardContent>
        {/* onSubmit: 이 폼이 제출될 때 handleSubmit 함수를 실행 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 이메일 입력 필드 */}
          <div>
              <Label htmlFor="email" className="text-slate-300">
                이메일
              </Label>
            <Input
              id="email"
              type="email"
              placeholder="이메일을 입력하세요"
              // value: 현재 입력 상자의 값
              value={email}
              // onChange: 사용자가 입력할 때마다 실행 (입력된 값을 email 상태에 저장)
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 bg-slate-800 border-slate-700 text-white placeholder-slate-500"
            />
          </div>

          {/* 비밀번호 입력 필드 */}
          <div>
              <Label htmlFor="password" className="text-slate-300">
                비밀번호
              </Label>
            <Input
              id="password"
              type="password"
              placeholder="비밀번호를 입력하세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 bg-slate-800 border-slate-700 text-white placeholder-slate-500"
            />
          </div>

          {/* 에러가 있으면 빨간색으로 표시 */}
          {error && <div className="text-red-400 text-sm">{error}</div>}

          {/* 로그인 버튼: isLoading이 true면 버튼을 누를 수 없게 함 (disabled) */}
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {/* isLoading이 true면 "로그인 중...", false면 "로그인" 표시 */}
            {isLoading ? "로그인 중..." : "로그인"}
          </Button>
        </form>

        {/* 회원가입 링크 */}
        <div className="mt-6 text-center text-sm text-slate-400">
          계정이 없으신가요?{" "}
            <Link href="/register" className="text-blue-400 hover:text-blue-300">
              회원가입
            </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    // Suspense: 로딩 중일 때 fallback UI를 보여주는 React 기능
    // LoginForm이 로딩 중이면 "로딩 중..." 메시지를 표시
    <Suspense
      fallback={
          <Card className="border-slate-700 bg-slate-900">
            <CardContent className="p-8 text-center text-slate-400">
              로딩 중...
            </CardContent>
          </Card>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
