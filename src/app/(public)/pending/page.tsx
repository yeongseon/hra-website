import Link from "next/link";
import { Clock3, Home, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function PendingPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-3xl items-center px-4 py-16 sm:px-6">
      <Card className="w-full border-[#D9D9D9] shadow-[var(--shadow-soft)]">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <Clock3 className="size-7" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl text-[#1a1a1a]">승인 대기 중입니다</CardTitle>
            <p className="text-sm leading-6 text-[#666666] sm:text-base">
              로그인은 완료되었지만 자료실과 마이페이지는 관리자 승인 후 이용할 수 있습니다.
              승인 여부가 궁금하시면 운영진에게 문의해 주세요.
            </p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className={cn(
              buttonVariants({ variant: "default" }),
              "bg-[#1a1a1a] text-white hover:bg-[#333333]",
            )}
          >
            <Home className="mr-2 size-4" />
            홈으로 이동
          </Link>
          <Link
            href="/faq"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "border-[#D9D9D9] text-[#1a1a1a]",
            )}
          >
            <Mail className="mr-2 size-4" />
            문의 방법 보기
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
