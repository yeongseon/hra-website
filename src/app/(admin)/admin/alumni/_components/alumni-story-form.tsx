"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AlumniStoryActionState } from "@/features/alumni/actions";

type AlumniStoryFormValues = {
  name?: string;
  title?: string | null;
  quote?: string | null;
  content?: string | null;
  imageUrl?: string | null;
  isFeatured?: boolean;
  order?: number;
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

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const previewUrl = useMemo(() => {
    if (selectedImage) {
      return URL.createObjectURL(selectedImage);
    }
    return defaultValues?.imageUrl ?? null;
  }, [defaultValues?.imageUrl, selectedImage]);

  useEffect(() => {
    if (!selectedImage || !previewUrl) return;
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl, selectedImage]);

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
                <Label htmlFor="name" className="text-[#1a1a1a]">
                  이름
                </Label>
                <Input
                  id="name"
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={defaultValues?.name ?? ""}
                  className="border-[#D9D9D9] text-[#1a1a1a]"
                />
                {state.fieldErrors?.name ? <p className="text-xs text-red-600">{state.fieldErrors.name}</p> : null}
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
                {state.fieldErrors?.title ? <p className="text-xs text-red-600">{state.fieldErrors.title}</p> : null}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="quote" className="text-[#1a1a1a]">
                  인용구 <span className="text-xs text-red-500">*</span>
                </Label>
                <Textarea
                  id="quote"
                  name="quote"
                  required
                  defaultValue={defaultValues?.quote ?? ""}
                  maxLength={500}
                  className="min-h-24 border-[#D9D9D9] text-[#1a1a1a]"
                />
                {state.fieldErrors?.quote ? <p className="text-xs text-red-600">{state.fieldErrors.quote}</p> : null}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="content" className="text-[#1a1a1a]">
                  내용 <span className="text-xs text-red-500">*</span>
                </Label>
                <Textarea
                  id="content"
                  name="content"
                  required
                  defaultValue={defaultValues?.content ?? ""}
                  maxLength={5000}
                  className="min-h-48 border-[#D9D9D9] text-[#1a1a1a]"
                />
                {state.fieldErrors?.content ? <p className="text-xs text-red-600">{state.fieldErrors.content}</p> : null}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="image" className="text-[#1a1a1a]">
                  프로필 이미지
                </Label>
                <div className="flex items-start gap-4">
                  {previewUrl ? (
                    <Image
                      src={previewUrl}
                      alt="프로필 이미지 미리보기"
                      width={120}
                      height={120}
                      unoptimized
                      className="h-[120px] w-[120px] rounded-full border border-[#D9D9D9] object-cover"
                    />
                  ) : (
                    <div className="flex h-[120px] w-[120px] items-center justify-center rounded-full border border-dashed border-[#D9D9D9] text-sm text-[#666666]">
                      미리보기 없음
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <Input
                      id="image"
                      name="image"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="h-10 border-[#D9D9D9] file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[#1a1a1a]"
                      onChange={(event) => {
                        setSelectedImage(event.target.files?.[0] ?? null);
                      }}
                    />
                    <p className="text-xs text-[#666666]">JPG, PNG, WEBP 형식만 가능하며 최대 5MB까지 업로드할 수 있습니다.</p>
                    {state.fieldErrors?.image ? <p className="text-xs text-red-600">{state.fieldErrors.image}</p> : null}
                  </div>
                </div>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="imageUrl" className="text-[#1a1a1a]">
                  이미지 URL <span className="text-xs text-[#666666]">(파일 업로드 대신 URL 직접 입력)</span>
                </Label>
                <Input
                  id="imageUrl"
                  name="imageUrl"
                  placeholder="https://example.com/image.jpg"
                  defaultValue={defaultValues?.imageUrl ?? ""}
                  className="border-[#D9D9D9] text-[#1a1a1a]"
                />
                <p className="text-xs text-[#666666]">파일을 업로드하면 이 URL은 무시됩니다.</p>
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

              <div className="md:col-span-2">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-[#1a1a1a]">
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
