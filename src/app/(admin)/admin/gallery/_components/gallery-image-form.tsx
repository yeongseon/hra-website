"use client";

import Image from "next/image";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ImagePlus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GalleryActionState } from "@/features/gallery/actions";
import { cn } from "@/lib/utils";

const initialState: GalleryActionState = {
  success: false,
  message: "",
};

type GalleryImageFormProps = {
  action: (formData: FormData) => Promise<GalleryActionState>;
};

type PreviewItem = {
  id: string;
  file: File;
  url: string;
};

function createFileId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))}KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

export function GalleryImageForm({ action }: GalleryImageFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [submittedCount, setSubmittedCount] = useState(0);

  const previewItems = useMemo<PreviewItem[]>(() => {
    return selectedFiles.map((file) => ({
      id: createFileId(file),
      file,
      url: URL.createObjectURL(file),
    }));
  }, [selectedFiles]);

  useEffect(() => {
    return () => {
      previewItems.forEach((item) => {
        URL.revokeObjectURL(item.url);
      });
    };
  }, [previewItems]);

  const syncInputFiles = (files: File[]) => {
    if (!inputRef.current) {
      return;
    }

    const dataTransfer = new DataTransfer();
    files.forEach((file) => {
      dataTransfer.items.add(file);
    });
    inputRef.current.files = dataTransfer.files;
  };

  const mergeFiles = (incomingFiles: File[]) => {
    setSelectedFiles((previousFiles) => {
      const fileMap = new Map<string, File>();

      previousFiles.forEach((file) => {
        fileMap.set(createFileId(file), file);
      });

      incomingFiles.forEach((file) => {
        fileMap.set(createFileId(file), file);
      });

      const nextFiles = Array.from(fileMap.values());
      syncInputFiles(nextFiles);
      return nextFiles;
    });
  };

  const removeFile = (targetId: string) => {
    setSelectedFiles((previousFiles) => {
      const nextFiles = previousFiles.filter((file) => createFileId(file) !== targetId);
      syncInputFiles(nextFiles);
      return nextFiles;
    });
  };

  const [state, formAction, isPending] = useActionState(
    async (_prevState: GalleryActionState, formData: FormData) => {
      setSubmittedCount(selectedFiles.length);
      const result = await action(formData);

      if (result.success) {
        formRef.current?.reset();
        setSelectedFiles([]);
        syncInputFiles([]);
      }

      setSubmittedCount(0);

      return result;
    },
    initialState,
  );

  const submitLabel = useMemo(() => {
    if (isPending) {
      return `${submittedCount}/${submittedCount}장 업로드 중...`;
    }

    if (selectedFiles.length > 0) {
      return `${selectedFiles.length}장 업로드`;
    }

    return "이미지 업로드";
  }, [isPending, selectedFiles.length, submittedCount]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-5 rounded-2xl border border-[#D9D9D9] bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.08),_transparent_52%),linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(248,250,252,0.98))] p-5 shadow-[var(--shadow-soft)]"
    >
      {state.message ? (
        <div
          className={cn(
            "flex items-start gap-2 rounded-xl border px-4 py-3 text-sm",
            state.success
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700",
          )}
        >
          {state.success ? (
            <CheckCircle2 className="mt-0.5 size-4" />
          ) : (
            <AlertCircle className="mt-0.5 size-4" />
          )}
          <span>{state.message}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        <div className="space-y-3">
          <Label htmlFor="images" className="text-sm font-medium text-[#1a1a1a]">
            이미지 파일 선택
          </Label>
          <div className="rounded-2xl border border-dashed border-[#D9D9D9] bg-white/90 p-4">
            <Input
              ref={inputRef}
              id="images"
              name="images"
              type="file"
              required
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="border-[#D9D9D9] bg-white text-[#1a1a1a] file:text-[#1a1a1a]"
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                mergeFiles(files);
              }}
            />
            <p className="mt-3 text-sm leading-6 text-[#666666]">
              JPG, PNG, WEBP, GIF 형식의 이미지 파일을 여러 장 한 번에 선택할 수 있습니다. 업로드 순서는
              현재 등록된 이미지 뒤에 자동으로 이어집니다.
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-[#D9D9D9] bg-white/80 p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-[#1a1a1a]">업로드 안내</p>
            <p className="text-sm leading-6 text-[#666666]">
              첫 번째 이미지가 자동으로 커버 이미지가 되며, 대체 텍스트는 이번에 선택한 모든 이미지에 공통으로
              저장됩니다.
            </p>
          </div>

          <div className="rounded-xl bg-[#F8FAFC] px-4 py-3 text-sm text-[#666666]">
            선택됨 <span className="font-semibold text-[#2563EB]">{selectedFiles.length}장</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="alt" className="text-sm font-medium text-[#1a1a1a]">
          공통 대체 텍스트
        </Label>
        <Input
          id="alt"
          name="alt"
          placeholder="예: HRA 세미나 현장 스케치"
          className="border-[#D9D9D9] bg-white text-[#1a1a1a] placeholder:text-[#9CA3AF]"
        />
      </div>

      {previewItems.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-[#D9D9D9] bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-[#EEF2F7] px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-[#1a1a1a]">
              <ImagePlus className="size-4 text-[#2563EB]" />
              업로드 미리보기
            </div>
            <span className="text-xs text-[#666666]">업로드 전 목록에서 개별 이미지를 제거할 수 있습니다.</span>
          </div>

          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {previewItems.map((item, index) => (
              <div
                key={item.id}
                className="group overflow-hidden rounded-2xl border border-[#E5E7EB] bg-[linear-gradient(180deg,_rgba(248,250,252,0.7),_rgba(255,255,255,1))]"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-[#F3F4F6]">
                  <Image
                    src={item.url}
                    alt={item.file.name}
                    fill
                    unoptimized
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />

                  <button
                    type="button"
                    onClick={() => removeFile(item.id)}
                    disabled={isPending}
                    className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full bg-black/65 text-white transition hover:bg-black"
                    aria-label={`${item.file.name} 제거`}
                  >
                    <X className="size-4" />
                  </button>

                  {index === 0 ? (
                    <span className="absolute left-2 top-2 rounded-full bg-[#2563EB] px-2.5 py-1 text-xs font-semibold text-white">
                      첫 이미지 · 커버 후보
                    </span>
                  ) : null}
                </div>

                <div className="space-y-2 px-4 py-3">
                  <p className="line-clamp-1 text-sm font-medium text-[#1a1a1a]">{item.file.name}</p>
                  <div className="flex items-center justify-between gap-3 text-xs text-[#666666]">
                    <span>{formatFileSize(item.file.size)}</span>
                    <span>{index + 1}번째 업로드</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#D9D9D9] bg-white/70 px-6 py-10 text-center text-sm leading-6 text-[#666666]">
          여러 이미지를 선택하면 이곳에 썸네일 미리보기가 표시됩니다.
        </div>
      )}

      <Button
        type="submit"
        disabled={isPending || selectedFiles.length === 0}
        className="w-full bg-[#2563EB] text-white hover:bg-[#1D4ED8]"
      >
        <Plus className="mr-1 size-4" />
        {submitLabel}
      </Button>
    </form>
  );
}
