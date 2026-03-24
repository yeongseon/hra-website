/**
 * 회원가입 페이지
 * 클라이언트 컴포넌트: 사용자가 이름, 이메일, 비밀번호를 입력하여 회원가입할 수 있는 페이지입니다
 * - "use client"가 있으므로 브라우저에서 직접 실행되는 컴포넌트입니다
 * - useState 훅으로 입력값 상태를 관리합니다
 * - registerUser() 서버 액션을 호출하여 서버에서 데이터베이스에 저장합니다
 */
"use client";

import { registerUser } from "@/features/auth/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function RegisterPage() {
  // useRouter: 회원가입 완료 후 로그인 페이지로 이동시키기 위해 사용
  const router = useRouter();
  // useState 훅: 4개의 입력값을 상태로 관리
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // error: 회원가입 실패 시 에러 메시지 저장
  const [error, setError] = useState("");
  // isLoading: 회원가입 진행 중인지 표시 (true면 진행 중, false면 완료)
  const [isLoading, setIsLoading] = useState(false);

  // handleSubmit: 회원가입 버튼을 클릭할 때 실행되는 함수
  const handleSubmit = async (e: React.FormEvent) => {
    // e.preventDefault(): 폼의 기본 동작(페이지 새로고침)을 막음
    e.preventDefault();
    // 에러 메시지 초기화
    setError("");
    // 회원가입 진행 중으로 표시
    setIsLoading(true);

    try {
      // FormData: 폼 데이터를 만드는 자바스크립트 객체
      // 4개의 입력값을 FormData에 담아서 서버로 전송할 준비
      const formData = new FormData();
      formData.append("name", name);
      formData.append("email", email);
      formData.append("password", password);
      formData.append("confirmPassword", confirmPassword);

      // registerUser(): 서버 액션 - 서버에서 실행되어 데이터베이스에 새 회원 정보를 저장
      // result: 서버에서 돌아온 결과 (성공/실패 여부와 메시지)
      const result = await registerUser(formData);

      // 만약 회원가입에 실패했다면 (result.success가 false라면)
      if (!result.success) {
        // 에러 메시지를 표시 (예: "이미 존재하는 이메일입니다")
        setError(result.error || "회원가입에 실패했습니다");
      } 
      // 만약 회원가입이 성공했다면
      else {
        // 로그인 페이지로 이동 (registered=true 파라미터를 붙여서)
        router.push("/login?registered=true");
      }
    } catch {
      // 예상치 못한 오류가 발생했을 때 (예: 네트워크 끊김)
      setError("오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      // try와 catch가 모두 끝난 후 무조건 실행됨
      // 회원가입 진행 중 상태를 해제
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-slate-700 bg-slate-900">
      <CardHeader>
        <CardTitle className="text-2xl text-white">회원가입</CardTitle>
      </CardHeader>
      <CardContent>
        {/* onSubmit: 이 폼이 제출될 때 handleSubmit 함수를 실행 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 이름 입력 필드 */}
          <div>
            <Label htmlFor="name" className="text-slate-300">
              이름
            </Label>
            <Input
              id="name"
              type="text"
              placeholder="홍길동"
              // value: 현재 입력 상자의 값 (name 상태에서 가져옴)
              value={name}
              // onChange: 사용자가 입력할 때마다 실행 (입력된 값을 name 상태에 저장)
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 bg-slate-800 border-slate-700 text-white placeholder-slate-500"
            />
          </div>

          {/* 이메일 입력 필드 */}
          <div>
            <Label htmlFor="email" className="text-slate-300">
              이메일
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="이메일을 입력하세요"
              value={email}
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

          {/* 비밀번호 확인 입력 필드 (입력한 비밀번호가 같은지 확인하기 위함) */}
          <div>
            <Label htmlFor="confirmPassword" className="text-slate-300">
              비밀번호 확인
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="비밀번호를 입력하세요"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="mt-1 bg-slate-800 border-slate-700 text-white placeholder-slate-500"
            />
          </div>

          {/* 에러가 있으면 빨간색으로 표시 */}
          {error && <div className="text-red-400 text-sm">{error}</div>}

          {/* 회원가입 버튼: isLoading이 true면 버튼을 누를 수 없게 함 (disabled) */}
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {/* isLoading이 true면 "가입 중...", false면 "회원가입" 표시 */}
            {isLoading ? "가입 중..." : "회원가입"}
          </Button>
        </form>

        {/* 로그인 페이지 링크 */}
        <div className="mt-6 text-center text-sm text-slate-400">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="text-blue-400 hover:text-blue-300">
            로그인
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
