import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Shield, LogOut } from "lucide-react";

export const metadata: Metadata = {
  title: "마이페이지",
};

export default async function MyPage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center text-[#1a1a1a]">
        <p>로그인이 필요합니다.</p>
      </div>
    );
  }

  const { user } = session;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12 md:py-20">
      <div className="mb-10 text-center md:text-left">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#1a1a1a] mb-4">
          마이페이지
        </h1>
        <p className="text-[#666666] text-lg">
          환영합니다, <span className="text-[#1a1a1a] font-medium">{user.name}</span>님.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <section>
          <h2 className="text-2xl font-bold text-[#1a1a1a] mb-6 flex items-center gap-2">
            <User className="w-6 h-6 text-blue-600" />
            프로필 정보
          </h2>
          <Card className="bg-white border-[#D9D9D9] shadow-[var(--shadow-soft)] rounded-2xl text-[#1a1a1a] overflow-hidden">
            <CardContent className="p-8 sm:p-10">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8">
                <Avatar className="w-24 h-24 sm:w-32 sm:h-32 border-2 border-[#D9D9D9] rounded-2xl shadow-[var(--shadow-soft)]">
                  <AvatarImage src={user.image || undefined} alt={user.name || "사용자 프로필"} className="object-cover" />
                  <AvatarFallback className="bg-gray-100 text-3xl font-bold text-[#666666] rounded-2xl">
                    {user.name?.[0] || "?"}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 space-y-6 w-full text-center sm:text-left">
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2 justify-center sm:justify-start">
                      <h3 className="text-2xl sm:text-3xl font-bold text-[#1a1a1a]">
                        {user.name}
                      </h3>
                      <Badge 
                        variant="secondary" 
                        className={`w-fit mx-auto sm:mx-0 ${
                          user.role === "ADMIN" 
                            ? "bg-indigo-50 text-indigo-600 hover:bg-indigo-50 border border-indigo-200" 
                            : "bg-blue-50 text-blue-600 hover:bg-blue-50 border border-blue-200"
                        }`}
                      >
                        <Shield className="w-3 h-3 mr-1.5" />
                        {user.role === "ADMIN" ? "관리자" : "회원"}
                      </Badge>
                    </div>
                  </div>

                  <Separator className="bg-[#D9D9D9] hidden sm:block" />

                  <div className="space-y-4">
                    <div className="flex items-center justify-center sm:justify-start gap-3 text-[#666666]">
                      <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0 border border-[#D9D9D9]">
                        <Mail className="w-5 h-5 text-[#666666]" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-500 mb-0.5">이메일 주소</span>
                        <span className="text-base font-medium text-gray-700">{user.email}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-bold text-[#1a1a1a] mb-6 flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-600" />
            계정 설정
          </h2>
          <Card className="bg-white border-[#D9D9D9] shadow-[var(--shadow-soft)] rounded-2xl text-[#1a1a1a] hover:bg-gray-50 transition-colors">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <LogOut className="w-5 h-5 text-[#666666]" />
                로그아웃
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <p className="text-[#666666]">
                  현재 기기에서 로그아웃하시려면 상단 메뉴의 로그아웃 버튼을 이용해 주세요.
                </p>
                <Badge variant="outline" className="border-[#D9D9D9] text-[#666666] px-4 py-1.5 font-normal">
                  상단 내비게이션 참조
                </Badge>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
