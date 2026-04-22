"use client";

import Image from "next/image";
import { useActionState, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ImagePlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GalleryActionState } from "@/features/gallery/actions";

const initialState: GalleryActionState = {
  success: false,
  message: "",
};

type GalleryImageFormProps = {
  action: (formData: FormData) => Promise<GalleryActionState>;
};

export function GalleryImageForm({ action }: GalleryImageFormProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const previewUrl = useMemo(() => {
    if (!selectedFile) {
      return null;
    }

    return URL.createObjectURL(selectedFile);
  }, [selectedFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const [state, formAction, isPending] = useActionState(
    async (_prevState: GalleryActionState, formData: FormData) => {
      const result = await action(formData);

      if (result.success) {
        setSelectedFile(null);
      }

      return result;
    },
    initialState,
  );

  const submitLabel = useMemo(() => {
    if (isPending) {
      return "업로드 중...";
    }

    if (selectedFile) {
      return "저장하기";
    }

    return "이미지 업로드";
  }, [isPending, selectedFile]);

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      {state.message ? (
        <div
          className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
            state.success
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="image" className="text-slate-700">
            이미지 파일
          </Label>
          <Input
            id="image"
            name="image"
            type="file"
            required
            accept="image/*"
            className="border-slate-200 bg-white"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              setSelectedFile(file);
            }}
          />
          <p className="text-sm text-slate-500">
            파일 선택 후 아래 <span className="font-medium text-[#2563EB]">[이미지 업로드]</span> 버튼을 눌러야 저장됩니다.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="order" className="text-slate-700">
            정렬 순서
          </Label>
          <Input
            id="order"
            name="order"
            type="number"
            min={0}
            defaultValue={0}
            className="border-slate-200 bg-white"
          />
        </div>

        <div className="space-y-2 md:col-span-3">
          <Label htmlFor="alt" className="text-slate-700">
            대체 텍스트
          </Label>
          <Input
            id="alt"
            name="alt"
            placeholder="이미지 설명"
            className="border-slate-200 bg-white"
          />
        </div>
      </div>

      {previewUrl ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-sm text-slate-600">
            <ImagePlus className="size-4" />
            업로드 미리보기
          </div>
          <Image
            src={previewUrl}
            alt="업로드 미리보기"
            width={1200}
            height={672}
            unoptimized
            className="h-56 w-full object-cover"
          />
        </div>
      ) : null}

      <Button
        type="submit"
        disabled={isPending || !selectedFile}
        className="w-full bg-[#2563EB] hover:bg-blue-700"
      >
        <Plus className="mr-1 size-4" />
        {submitLabel}
      </Button>
    </form>
  );
}
