"use client";

// FAQ 질문·답변 생성/수정 폼 컴포넌트 (관리자 전용)

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FaqItemActionState } from "@/features/faq/actions";

type FaqItemFormProps = {
  title: string;
  submitLabel: string;
  action: (formData: FormData) => Promise<FaqItemActionState>;
  defaultValues?: {
    question?: string;
    answer?: string;
    order?: number;
  };
};

const initialState: FaqItemActionState = { success: false, message: "" };

export function FaqItemForm({ title, submitLabel, action, defaultValues }: FaqItemFormProps) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: FaqItemActionState, formData: FormData) => {
      return await action(formData);
    },
    initialState
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <Card className="border-[#D9D9D9] bg-white py-0 shadow-sm">
        <CardHeader className="space-y-1 border-b border-[#D9D9D9] py-6">
          <CardTitle className="text-2xl font-semibold text-[#1a1a1a]">{title}</CardTitle>
        </CardHeader>
        <CardContent className="py-6">
          <form action={formAction} className="space-y-6">
            {state.message && !state.success ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{state.message}</span>
              </div>
            ) : null}

            <div className="w-40 space-y-2">
              <Label htmlFor="order" className="text-[#1a1a1a]">
                표시 순서
              </Label>
              <Input
                id="order"
                name="order"
                type="number"
                min={0}
                step={1}
                defaultValue={defaultValues?.order ?? 0}
                className="border-[#D9D9D9] text-[#1a1a1a]"
              />
              {state.fieldErrors?.order ? (
                <p className="text-xs text-red-600">{state.fieldErrors.order}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="question" className="text-[#1a1a1a]">
                질문 <span className="text-xs text-red-500">*</span>
              </Label>
              <Input
                id="question"
                name="question"
                required
                maxLength={500}
                placeholder="질문을 입력하세요"
                defaultValue={defaultValues?.question ?? ""}
                className="border-[#D9D9D9] text-[#1a1a1a]"
              />
              {state.fieldErrors?.question ? (
                <p className="text-xs text-red-600">{state.fieldErrors.question}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="answer" className="text-[#1a1a1a]">
                답변 <span className="text-xs text-red-500">*</span>
              </Label>
              <Textarea
                id="answer"
                name="answer"
                required
                rows={8}
                placeholder="답변을 입력하세요 (줄바꿈 지원)"
                defaultValue={defaultValues?.answer ?? ""}
                className="min-h-40 border-[#D9D9D9] text-[#1a1a1a]"
              />
              {state.fieldErrors?.answer ? (
                <p className="text-xs text-red-600">{state.fieldErrors.answer}</p>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#D9D9D9] pt-4">
              <Button variant="outline" render={<Link href="/admin/faq" />}>
                취소
              </Button>
              <Button type="submit" disabled={isPending} className="bg-[#1a1a1a] text-white hover:bg-[#333333]">
                {isPending ? "저장 중..." : submitLabel}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
