"use client";

import { useActionState } from "react";
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

type ApplyFormProps = {
  cohortId: string;
};

const initialState: SubmitApplicationState = {
  success: false,
  message: "",
};

export default function ApplyForm({ cohortId }: ApplyFormProps) {
  const [state, formAction, isPending] = useActionState(submitApplication, initialState);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-20 md:py-32">
      <section className="mb-8 space-y-4 sm:mb-10">
        <Badge
          variant="outline"
          className="border-emerald-300 bg-emerald-50 text-emerald-700"
        >
          비회원 지원
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a] sm:text-3xl md:text-4xl lg:text-5xl">
          지원서 작성
        </h1>
        <p className="max-w-2xl text-sm text-[#666666] md:text-base">
          비회원 지원 페이지입니다. 필수 정보를 정확히 작성해 제출해주세요.
        </p>
      </section>

      <Card className="rounded-2xl border-[#D9D9D9] bg-white py-0 shadow-[var(--shadow-soft)]">
        <CardHeader className="border-b border-[#D9D9D9] py-6">
          <CardTitle className="text-xl text-[#1a1a1a] md:text-2xl">지원 정보 입력</CardTitle>
        </CardHeader>
        <CardContent className="py-6">
          <form action={formAction} className="space-y-5">
            <input type="hidden" name="cohortId" value={cohortId} />

            <div
              className="pointer-events-none absolute opacity-0"
              style={{ position: "absolute", left: "-9999px" }}
              aria-hidden="true"
            >
              <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </div>

            {state.message ? (
              <div
                className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
                  state.success
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-red-300 bg-red-50 text-red-700"
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
                <Label htmlFor="name" className="text-[#1a1a1a]">
                  이름
                </Label>
                <Input
                  id="name"
                  name="name"
                  required
                  className="h-10 border-[#D9D9D9] bg-white text-[#1a1a1a]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-[#1a1a1a]">
                  이메일
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="h-10 border-[#D9D9D9] bg-white text-[#1a1a1a]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-[#1a1a1a]">
                  전화번호
                </Label>
                <Input
                  id="phone"
                  name="phone"
                  className="h-10 border-[#D9D9D9] bg-white text-[#1a1a1a]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="university" className="text-[#1a1a1a]">
                  대학교
                </Label>
                <Input
                  id="university"
                  name="university"
                  className="h-10 border-[#D9D9D9] bg-white text-[#1a1a1a]"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="major" className="text-[#1a1a1a]">
                  전공
                </Label>
                <Input
                  id="major"
                  name="major"
                  className="h-10 border-[#D9D9D9] bg-white text-[#1a1a1a]"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="motivation" className="text-[#1a1a1a]">
                  지원 동기
                </Label>
                <Textarea
                  id="motivation"
                  name="motivation"
                  required
                  className="min-h-36 border-[#D9D9D9] bg-white text-[#1a1a1a]"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="additionalInfo" className="text-[#1a1a1a]">
                  추가 정보
                </Label>
                <Textarea
                  id="additionalInfo"
                  name="additionalInfo"
                  className="min-h-28 border-[#D9D9D9] bg-white text-[#1a1a1a]"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isPending || state.success}
              className="h-10 border border-blue-600 bg-white text-blue-600 hover:bg-blue-50"
            >
              {isPending ? "제출 중..." : state.success ? "제출 완료" : "지원서 제출"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
