"use client";

import { useActionState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  submitApplication,
  type SubmitApplicationState,
} from "@/features/applications/actions/submit";

const initialState: SubmitApplicationState = {
  success: false,
  message: "",
};

function ApplyForm() {
  const searchParams = useSearchParams();
  const cohortId = searchParams.get("cohort") ?? "";
  const [state, formAction, isPending] = useActionState(submitApplication, initialState);

  return (
    <div className="mx-auto max-w-7xl px-6 py-20 md:py-32">
      <section className="mb-10 space-y-4">
        <Badge
          variant="outline"
          className="border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
        >
          비회원 지원
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
          지원서 작성
        </h1>
        <p className="max-w-2xl text-sm text-zinc-300 md:text-base">
          비회원 지원 페이지입니다. 필수 정보를 정확히 작성해 제출해주세요.
        </p>
      </section>

      <Card className="border-white/10 bg-zinc-950/80 py-0">
        <CardHeader className="border-b border-white/10 py-6">
          <CardTitle className="text-xl text-white md:text-2xl">지원 정보 입력</CardTitle>
        </CardHeader>
        <CardContent className="py-6">
          <form action={formAction} className="space-y-5">
            <input type="hidden" name="cohortId" value={cohortId} />

            {!cohortId ? (
              <div className="rounded-lg border border-amber-300/30 bg-amber-500/15 px-4 py-3 text-sm text-amber-100">
                모집 기수 정보가 없습니다. 모집안내 페이지에서 다시 접근해주세요.
              </div>
            ) : null}

            {state.message ? (
              <div
                className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
                  state.success
                    ? "border-emerald-300/40 bg-emerald-500/15 text-emerald-100"
                    : "border-red-300/40 bg-red-500/15 text-red-100"
                }`}
              >
                {state.success ? (
                  <CheckCircle2 className="mt-0.5 size-4" />
                ) : (
                  <AlertCircle className="mt-0.5 size-4" />
                )}
                <span>{state.message}</span>
              </div>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-zinc-100">
                  이름
                </Label>
                <Input id="name" name="name" required className="h-10 border-white/15 text-white" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-100">
                  이메일
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="h-10 border-white/15 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-zinc-100">
                  전화번호
                </Label>
                <Input id="phone" name="phone" className="h-10 border-white/15 text-white" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="university" className="text-zinc-100">
                  대학교
                </Label>
                <Input
                  id="university"
                  name="university"
                  className="h-10 border-white/15 text-white"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="major" className="text-zinc-100">
                  전공
                </Label>
                <Input id="major" name="major" className="h-10 border-white/15 text-white" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="motivation" className="text-zinc-100">
                  지원 동기
                </Label>
                <Textarea
                  id="motivation"
                  name="motivation"
                  required
                  className="min-h-36 border-white/15 text-white"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="additionalInfo" className="text-zinc-100">
                  추가 정보
                </Label>
                <Textarea
                  id="additionalInfo"
                  name="additionalInfo"
                  className="min-h-28 border-white/15 text-white"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={!cohortId || isPending || state.success}
              className="h-10 bg-emerald-500 text-black hover:bg-emerald-400"
            >
              {isPending ? "제출 중..." : state.success ? "제출 완료" : "지원서 제출"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function RecruitmentApplyPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-6 py-20 text-center text-zinc-400">
          로딩 중...
        </div>
      }
    >
      <ApplyForm />
    </Suspense>
  );
}
