"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownEditor } from "@/components/admin/markdown-editor";
import type { AlumniStoryActionState } from "@/features/alumni/actions";

type AlumniStoryFormValues = {
  name?: string;
  title?: string | null;
  quote?: string | null;
  content?: string | null;
  isFeatured?: boolean;
};

type AlumniStoryFormProps = {
  title: string;
  description?: string;
  submitLabel: string;
  action: (formData: FormData) => Promise<AlumniStoryActionState | void>;
  defaultValues?: AlumniStoryFormValues;
};

const initialState: AlumniStoryActionState = {
  success: false,
  message: "",
};

export function AlumniStoryForm({
  title,
  description,
  submitLabel,
  action,
  defaultValues,
}: AlumniStoryFormProps) {
  const [state, formAction, isPending] = useActionState(
    async (_prevState: AlumniStoryActionState, formData: FormData) => {
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
              <div className="space-y-2">
                <Label htmlFor="name" className="text-[#1a1a1a]">이름</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={defaultValues?.name ?? ""}
                  className="border-[#D9D9D9] text-[#1a1a1a]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="title" className="text-[#1a1a1a]">
                  소속/직함 <span className="text-xs text-[#666666]">(선택)</span>
                </Label>
                <Input
                  id="title"
                  name="title"
                  maxLength={100}
                  defaultValue={defaultValues?.title ?? ""}
                  className="border-[#D9D9D9] text-[#1a1a1a]"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="quote" className="text-[#1a1a1a]">
                  대표 문구 (목록 메인 노출) <span className="text-xs text-red-500">*</span>
                </Label>
                <Textarea
                  id="quote"
                  name="quote"
                  required
                  placeholder="예: HRA에서의 6개월은 제 인생의 전환점이 되었습니다."
                  defaultValue={defaultValues?.quote ?? ""}
                  maxLength={500}
                  className="min-h-20 border-[#D9D9D9] text-[#1a1a1a]"
                />
                <p className="text-xs text-[#666666]">목록 페이지에서 가장 크게 강조되는 문장입니다.</p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="content" className="text-[#1a1a1a]">
                  상세 이야기 내용 (상세 페이지 노출) <span className="text-xs text-red-500">*</span>
                </Label>
                <MarkdownEditor
                  id="content"
                  name="content"
                  required
                  defaultValue={defaultValues?.content ?? ""}
                  placeholder="수료생의 상세한 성장 이야기를 작성해주세요."
                />
              </div>

              <div className="md:col-span-2">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-[#1a1a1a] cursor-pointer">
                  <input
                    type="checkbox"
                    name="isFeatured"
                    value="true"
                    defaultChecked={defaultValues?.isFeatured ?? false}
                    className="size-4 rounded border-[#D9D9D9]"
                  />
                  메인 페이지 배너에 노출
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#D9D9D9] pt-4">
              <Button variant="outline" render={<Link href="/admin/alumni" />}>취소</Button>
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
