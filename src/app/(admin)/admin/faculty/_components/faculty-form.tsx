"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FacultyActionState } from "@/features/faculty/actions";

type FacultyCategory = "CLASSICS" | "BUSINESS" | "LECTURE";

type FacultyFormValues = {
  name?: string;
  category?: FacultyCategory;
  currentPosition?: string | null;
  formerPosition?: string | null;
  imageUrl?: string | null;
  order?: number;
};

type FacultyFormProps = {
  title: string;
  description?: string;
  submitLabel: string;
  action: (formData: FormData) => Promise<FacultyActionState>;
  defaultValues?: FacultyFormValues;
};

const initialState: FacultyActionState = {
  success: false,
  message: "",
};

const categoryOptions: Array<{ value: FacultyCategory; label: string }> = [
  { value: "CLASSICS", label: "고전읽기" },
  { value: "BUSINESS", label: "기업실무" },
  { value: "LECTURE", label: "특강" },
];

export function FacultyForm({ title, description, submitLabel, action, defaultValues }: FacultyFormProps) {
  const [state, formAction, isPending] = useActionState(
    async (_prevState: FacultyActionState, formData: FormData) => {
      return action(formData);
    },
    initialState
  );
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const previewUrl = useMemo(() => {
    if (!selectedImage) {
      return defaultValues?.imageUrl ?? null;
    }

    return URL.createObjectURL(selectedImage);
  }, [defaultValues?.imageUrl, selectedImage]);

  useEffect(() => {
    if (!selectedImage || !previewUrl) {
      return;
    }

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl, selectedImage]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <Card className="border-[#D9D9D9] bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-[#D9D9D9] py-6">
          <CardTitle className="text-2xl font-semibold text-[#1a1a1a]">{title}</CardTitle>
          {description ? <p className="text-sm text-[#666666]">{description}</p> : null}
        </CardHeader>
        <CardContent className="py-6">
          <form action={formAction} encType="multipart/form-data" className="space-y-6">
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
                  defaultValue={defaultValues?.name ?? ""}
                  className="h-10 border-[#D9D9D9]"
                />
                {state.fieldErrors?.name ? <p className="text-xs text-red-600">{state.fieldErrors.name}</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="category" className="text-[#1a1a1a]">
                  카테고리
                </Label>
                <Select name="category" defaultValue={defaultValues?.category ?? "CLASSICS"}>
                  <SelectTrigger id="category" className="h-10 w-full border-[#D9D9D9] bg-white">
                    <SelectValue placeholder="카테고리를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {state.fieldErrors?.category ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.category}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="currentPosition" className="text-[#1a1a1a]">
                  현직
                </Label>
                <Input
                  id="currentPosition"
                  name="currentPosition"
                  defaultValue={defaultValues?.currentPosition ?? ""}
                  className="h-10 border-[#D9D9D9]"
                />
                {state.fieldErrors?.currentPosition ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.currentPosition}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="formerPosition" className="text-[#1a1a1a]">
                  전직
                </Label>
                <Input
                  id="formerPosition"
                  name="formerPosition"
                  defaultValue={defaultValues?.formerPosition ?? ""}
                  className="h-10 border-[#D9D9D9]"
                />
                {state.fieldErrors?.formerPosition ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.formerPosition}</p>
                ) : null}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="image" className="text-[#1a1a1a]">
                  프로필 사진
                </Label>
                <div className="flex flex-col items-start gap-4 rounded-xl border border-[#D9D9D9] px-5 py-5">
                  {previewUrl ? (
                    <Image
                      src={previewUrl}
                      alt="교수진 프로필 사진 미리보기"
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

                  <div className="w-full space-y-2">
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
                    <p className="text-sm text-[#666666]">{previewUrl ? "변경" : "사진 선택"}</p>
                    <p className="text-xs text-[#666666]">JPG, PNG, WEBP 형식만 가능하며 최대 5MB까지 업로드할 수 있습니다.</p>
                    {state.fieldErrors?.image ? <p className="text-xs text-red-600">{state.fieldErrors.image}</p> : null}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="order" className="text-[#1a1a1a]">
                  순서
                </Label>
                <Input
                  id="order"
                  name="order"
                  type="number"
                  step={1}
                  defaultValue={defaultValues?.order ?? 0}
                  className="h-10 border-[#D9D9D9]"
                />
                {state.fieldErrors?.order ? <p className="text-xs text-red-600">{state.fieldErrors.order}</p> : null}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#D9D9D9] pt-4">
              <Button variant="outline" render={<Link href="/admin/faculty" />}>
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
