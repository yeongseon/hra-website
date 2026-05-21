"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { AlertCircle, Copy, Check, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AlumniStoryActionState } from "@/features/alumni/actions";
import { cn } from "@/lib/utils";

type AlumniStoryImage = {
  id: string;
  url: string;
  alt: string | null;
  order: number;
};

type AlumniStoryFormValues = {
  name?: string;
  title?: string | null;
  quote?: string | null;
  content?: string | null;
  imageUrl?: string | null;
  isFeatured?: boolean;
  order?: number;
  images?: AlumniStoryImage[];
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

  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [representativeUrl, setRepresentativeUrl] = useState<string | null>(
    defaultValues?.imageUrl ?? null
  );
  const [copyStates, setCopyStates] = useState<Record<string, boolean>>({});

  const allImages = useMemo(() => {
    const existing = defaultValues?.images ?? [];
    const newOnes = selectedImages.map((file, index) => ({
      id: `new-${index}`,
      url: URL.createObjectURL(file),
      isNew: true,
      name: file.name,
    }));
    return [...existing.map(img => ({ ...img, isNew: false })), ...newOnes];
  }, [defaultValues?.images, selectedImages]);

  useEffect(() => {
    return () => {
      allImages.forEach(img => {
        if ((img as any).isNew) {
          URL.revokeObjectURL(img.url);
        }
      });
    };
  }, [allImages]);

  const handleCopyMarkdown = (url: string, id: string) => {
    const markdown = `![수료생 사진](${url})`;
    navigator.clipboard.writeText(markdown);
    setCopyStates(prev => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setCopyStates(prev => ({ ...prev, [id]: false }));
    }, 2000);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <Card className="border-[#D9D9D9] bg-white py-0 shadow-sm">
        <CardHeader className="space-y-2 border-b border-[#D9D9D9] py-6">
          <CardTitle className="text-2xl font-semibold text-[#1a1a1a]">{title}</CardTitle>
          {description ? <p className="text-sm text-[#666666]">{description}</p> : null}
        </CardHeader>
        <CardContent className="py-6">
          <form action={formAction} className="space-y-6">
            <input type="hidden" name="imageUrl" value={representativeUrl ?? ""} />
            
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
                <Textarea
                  id="content"
                  name="content"
                  required
                  placeholder="수료생의 상세한 성장 이야기를 작성해주세요. 마크다운 형식을 지원합니다."
                  defaultValue={defaultValues?.content ?? ""}
                  maxLength={5000}
                  className="min-h-64 border-[#D9D9D9] text-[#1a1a1a] font-mono"
                />
                <p className="text-xs text-[#666666]">아래 이미지 영역에서 이미지를 업로드하고 마크다운을 복사하여 본문에 붙여넣을 수 있습니다.</p>
              </div>

              <div className="space-y-4 md:col-span-2 border rounded-xl p-4 bg-gray-50/50 border-[#D9D9D9]">
                <Label className="text-[#1a1a1a] font-semibold block mb-2">이미지 관리</Label>
                
                <div className="flex-1 space-y-2">
                  <Input
                    id="images"
                    name="images"
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    className="h-10 border-[#D9D9D9] bg-white file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[#1a1a1a]"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      setSelectedImages(files);
                    }}
                  />
                  <p className="text-xs text-[#666666]">여러 장을 선택할 수 있습니다. 이미지를 업로드한 후 본문에 배치하거나 대표 이미지로 설정하세요.</p>
                </div>

                {allImages.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-4">
                    {allImages.map((img) => (
                      <div key={img.id} className="relative group rounded-lg border border-[#D9D9D9] bg-white overflow-hidden shadow-sm">
                        <div className="aspect-square relative">
                          <Image
                            src={img.url}
                            alt="이미지"
                            fill
                            className="object-cover"
                          />
                          {representativeUrl === img.url && (
                            <div className="absolute top-1 left-1 bg-yellow-400 text-white p-1 rounded-full shadow-sm">
                              <Star className="size-3 fill-white" />
                            </div>
                          )}
                        </div>
                        <div className="p-2 space-y-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full h-7 text-[10px] px-1"
                            onClick={() => handleCopyMarkdown(img.url, img.id)}
                          >
                            {copyStates[img.id] ? (
                              <><Check className="size-3 mr-1" /> 복사됨</>
                            ) : (
                              <><Copy className="size-3 mr-1" /> 마크다운 복사</>
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant={representativeUrl === img.url ? "default" : "outline"}
                            size="sm"
                            className={cn(
                              "w-full h-7 text-[10px] px-1",
                              representativeUrl === img.url ? "bg-yellow-500 hover:bg-yellow-600 border-yellow-500" : ""
                            )}
                            onClick={() => setRepresentativeUrl(img.url)}
                          >
                            <Star className="size-3 mr-1" /> 대표 설정
                          </Button>
                        </div>
                        {(img as any).isNew && (
                          <div className="absolute top-1 right-1 bg-blue-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                            NEW
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="order" className="text-[#1a1a1a]">순서</Label>
                <Input
                  id="order"
                  name="order"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={defaultValues?.order ?? 0}
                  className="border-[#D9D9D9] text-[#1a1a1a]"
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
