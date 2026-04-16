"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PressArticleActionState } from "@/features/press/actions";

type PressFormValues = {
  title?: string;
  source?: string;
  url?: string;
  publishedAt?: string;
  description?: string | null;
  imageUrl?: string | null;
  order?: number;
};

type PressFormProps = {
  title: string;
  description?: string;
  submitLabel: string;
  action: (formData: FormData) => Promise<PressArticleActionState | void>;
  defaultValues?: PressFormValues;
};

const initialState: PressArticleActionState = {
  success: false,
  message: "",
};

export function PressForm({ title, description, submitLabel, action, defaultValues }: PressFormProps) {
  const [state, formAction, isPending] = useActionState(
    async (_prevState: PressArticleActionState, formData: FormData) => {
      const result = await action(formData);
      return result ?? initialState;
    },
    initialState
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <Card className="border-[#D9D9D9] bg-white py-0 shadow-sm">
        <CardHeader className="space-y-2 border-b border-[#D9D9D9] py-6">
          <CardTitle className="text-2xl font-semibold text-[#1a1a1a]">{title}</CardTitle>
          {description ? <p className="text-sm text-[#666666]">{description}</p> : null}
        </CardHeader>
        <CardContent className="py-6">
          <form action={formAction} className="space-y-6">
            {state.message ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 size-4" />
                <span>{state.message}</span>
              </div>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="title" className="text-[#1a1a1a]">
                  제목 <span className="text-xs text-red-500">*</span>
                </Label>
                <Input
                  id="title"
                  name="title"
                  required
                  maxLength={300}
                  placeholder="기사 제목을 입력하세요"
                  defaultValue={defaultValues?.title ?? ""}
                  className="border-[#D9D9D9] text-[#1a1a1a]"
                />
                {state.fieldErrors?.title ? <p className="text-xs text-red-600">{state.fieldErrors.title}</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="source" className="text-[#1a1a1a]">
                  언론사명 <span className="text-xs text-red-500">*</span>
                </Label>
                <Input
                  id="source"
                  name="source"
                  required
                  maxLength={200}
                  placeholder="예: 조선일보"
                  defaultValue={defaultValues?.source ?? ""}
                  className="border-[#D9D9D9] text-[#1a1a1a]"
                />
                {state.fieldErrors?.source ? <p className="text-xs text-red-600">{state.fieldErrors.source}</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="publishedAt" className="text-[#1a1a1a]">
                  게시일 <span className="text-xs text-red-500">*</span>
                </Label>
                <Input
                  id="publishedAt"
                  name="publishedAt"
                  type="date"
                  required
                  defaultValue={defaultValues?.publishedAt ?? ""}
                  className="border-[#D9D9D9] text-[#1a1a1a]"
                />
                {state.fieldErrors?.publishedAt ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.publishedAt}</p>
                ) : null}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="url" className="text-[#1a1a1a]">
                  기사 링크 <span className="text-xs text-red-500">*</span>
                </Label>
                <Input
                  id="url"
                  name="url"
                  type="url"
                  required
                  placeholder="https://example.com/article"
                  defaultValue={defaultValues?.url ?? ""}
                  className="border-[#D9D9D9] text-[#1a1a1a]"
                />
                {state.fieldErrors?.url ? <p className="text-xs text-red-600">{state.fieldErrors.url}</p> : null}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description" className="text-[#1a1a1a]">
                  요약 <span className="text-xs text-[#666666]">(선택)</span>
                </Label>
                <Textarea
                  id="description"
                  name="description"
                  maxLength={5000}
                  placeholder="기사 요약을 입력하세요"
                  defaultValue={defaultValues?.description ?? ""}
                  className="min-h-32 border-[#D9D9D9] text-[#1a1a1a]"
                />
                {state.fieldErrors?.description ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.description}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="imageUrl" className="text-[#1a1a1a]">
                  썸네일 URL <span className="text-xs text-[#666666]">(선택)</span>
                </Label>
                <Input
                  id="imageUrl"
                  name="imageUrl"
                  type="url"
                  placeholder="https://example.com/image.jpg"
                  defaultValue={defaultValues?.imageUrl ?? ""}
                  className="border-[#D9D9D9] text-[#1a1a1a]"
                />
                {state.fieldErrors?.imageUrl ? <p className="text-xs text-red-600">{state.fieldErrors.imageUrl}</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="order" className="text-[#1a1a1a]">
                  순서
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
                {state.fieldErrors?.order ? <p className="text-xs text-red-600">{state.fieldErrors.order}</p> : null}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#D9D9D9] pt-4">
              <Button variant="outline" render={<Link href="/admin/press" />}>
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
