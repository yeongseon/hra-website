/**
 * 기수 정보 입력 폼 컴포넌트 (클라이언트 컴포넌트)
 *
 * 역할: 기수 정보(이름, 설명, 시작/종료일, 모집 상태 등)를 입력하는 폼
 * - 새 기수 생성 또는 기존 기수 수정에 사용
 * - 에러 메시지 표시
 *
 * 📌 클라이언트 컴포넌트 이유: 폼 제출, 상태 관리 필요
 */

"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { AlertCircle, ImagePlus, Trash2, Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import type { CohortActionState } from "@/features/recruitment/actions";

type RecruitmentStatus = "UPCOMING" | "OPEN" | "CLOSED";

type CohortFormValues = {
  name?: string;
  description?: string | null;
  imageUrl?: string | null;
  startDate?: string;
  endDate?: string;
  recruitmentStartDate?: string;
  recruitmentEndDate?: string;
  googleFormUrl?: string | null;
  googleSheetId?: string | null;
  recruitmentStatus?: RecruitmentStatus;
  isActive?: boolean;
  order?: number;
};

type CohortFormProps = {
  title: string;
  description?: string;
  submitLabel: string;
  action: (formData: FormData) => Promise<CohortActionState | void>;
  defaultValues?: CohortFormValues;
};

const initialState: CohortActionState = {
  success: false,
  message: "",
};

const statusOptions: Array<{ value: RecruitmentStatus; label: string }> = [
  { value: "UPCOMING", label: "예정" },
  { value: "OPEN", label: "모집중" },
  { value: "CLOSED", label: "마감" },
];

export function CohortForm({ title, description, submitLabel, action, defaultValues }: CohortFormProps) {
  // ⚙️ 서버 액션 호출 - 기수 정보를 서버로 전송하여 DB 저장/수정
  const [state, formAction, isPending] = useActionState(async (_prevState: CohortActionState, formData: FormData) => {
    const result = await action(formData);
    return result ?? initialState;
  }, initialState);

  const statusValue = defaultValues?.recruitmentStatus ?? "UPCOMING";
  const isActive = defaultValues?.isActive ?? true;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(defaultValues?.imageUrl ?? null);
  const [removeImage, setRemoveImage] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const hasImage = Boolean(previewUrl);

  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  const processFile = (file: File | undefined) => {
    if (!file) {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        setObjectUrl(null);
      }
      setPreviewUrl(removeImage ? null : (defaultValues?.imageUrl ?? null));
      setSelectedFileName(null);
      return;
    }

    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }

    const nextObjectUrl = URL.createObjectURL(file);
    setObjectUrl(nextObjectUrl);
    setRemoveImage(false);
    setPreviewUrl(nextObjectUrl);
    setSelectedFileName(file.name);
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    processFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      if (fileInputRef.current) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInputRef.current.files = dataTransfer.files;
      }
      processFile(file);
    }
  };

  const handleRemoveImage = () => {
    if (!window.confirm("이미지를 삭제하시겠습니까?")) {
      return;
    }
    
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      setObjectUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setRemoveImage(true);
    setPreviewUrl(null);
    setSelectedFileName(null);
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 md:py-16">
      <Card className="border border-slate-200 bg-white py-0 text-slate-900 shadow-sm">
        <CardHeader className="space-y-2 border-b border-slate-200 py-6">
          <CardTitle className="text-2xl font-semibold text-slate-900">{title}</CardTitle>
          {description ? <p className="text-sm text-slate-600">{description}</p> : null}
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
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="name">기수명</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  defaultValue={defaultValues?.name ?? ""}
                  className="h-10"
                />
                {state.fieldErrors?.name ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.name}</p>
                ) : null}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">설명</Label>
                <Textarea
                  id="description"
                  name="description"
                  defaultValue={defaultValues?.description ?? ""}
                  className="min-h-28"
                />
                {state.fieldErrors?.description ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.description}</p>
                ) : null}
              </div>

              <div className="space-y-3 md:col-span-2">
                <div className="space-y-2">
                  <Label htmlFor="image">기수 이미지</Label>
                  <input type="hidden" name="removeImage" value={removeImage ? "true" : "false"} />
                  <div
                    className={`relative overflow-hidden rounded-xl border transition-colors ${
                      isDragging ? "border-slate-500 bg-slate-100" : "border-slate-200 bg-slate-50"
                    } ${hasImage ? "" : "border-dashed border-slate-300"}`}
                  >
                    {isPending ? (
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
                        <Loader2 className="mb-2 size-8 animate-spin text-slate-900" />
                        <span className="text-sm font-medium text-slate-900">이미지 업로드 중...</span>
                      </div>
                    ) : null}
                    
                    {hasImage ? (
                      <button
                        type="button"
                        className="group relative block w-full cursor-pointer overflow-hidden p-0 text-left" 
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <Image
                          src={previewUrl ?? ""}
                          alt="기수 이미지 미리보기"
                          width={1200}
                          height={675}
                          unoptimized
                          className="aspect-video w-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                          <div className="flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-slate-900 shadow-sm">
                            <ImagePlus className="size-4" />
                            이미지 변경
                          </div>
                        </div>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="flex w-full aspect-video cursor-pointer items-center justify-center text-sm text-slate-500 hover:bg-slate-100 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <div className="flex flex-col items-center gap-2">
                          <ImagePlus className="size-6" />
                          <span>클릭하거나 이미지를 드래그하여 등록하세요</span>
                        </div>
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Input
                      ref={fileInputRef}
                      id="image"
                      name="image"
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={handleImageChange}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                        <ImagePlus className="mr-2 size-4" />
                        이미지 선택
                      </Button>
                      {hasImage ? (
                        <Button type="button" variant="outline" onClick={handleRemoveImage} className="text-red-600 hover:bg-red-50 hover:text-red-700">
                          <Trash2 className="mr-2 size-4" />
                          이미지 삭제
                        </Button>
                      ) : null}
                      {selectedFileName ? (
                        <span className="text-sm text-slate-500 truncate max-w-[200px]" title={selectedFileName}>
                          {selectedFileName}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">JPG, PNG, WebP 형식, 최대 4MB</p>
                  {state.fieldErrors?.image ? (
                    <p className="text-xs text-red-600">{state.fieldErrors.image}</p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="startDate">기수 시작일</Label>
                <Input
                  id="startDate"
                  name="startDate"
                  type="date"
                  defaultValue={defaultValues?.startDate ?? ""}
                  className="h-10"
                />
                {state.fieldErrors?.startDate ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.startDate}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="endDate">기수 종료일</Label>
                <Input
                  id="endDate"
                  name="endDate"
                  type="date"
                  defaultValue={defaultValues?.endDate ?? ""}
                  className="h-10"
                />
                {state.fieldErrors?.endDate ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.endDate}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="recruitmentStartDate">모집 시작일</Label>
                <Input
                  id="recruitmentStartDate"
                  name="recruitmentStartDate"
                  type="date"
                  defaultValue={defaultValues?.recruitmentStartDate ?? ""}
                  className="h-10"
                />
                {state.fieldErrors?.recruitmentStartDate ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.recruitmentStartDate}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="recruitmentEndDate">모집 종료일</Label>
                <Input
                  id="recruitmentEndDate"
                  name="recruitmentEndDate"
                  type="date"
                  defaultValue={defaultValues?.recruitmentEndDate ?? ""}
                  className="h-10"
                />
                {state.fieldErrors?.recruitmentEndDate ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.recruitmentEndDate}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="recruitmentStatus">모집 상태</Label>
                <Select name="recruitmentStatus" defaultValue={statusValue}>
                  <SelectTrigger id="recruitmentStatus" className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {state.fieldErrors?.recruitmentStatus ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.recruitmentStatus}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="order">정렬 순서</Label>
                <Input
                  id="order"
                  name="order"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={defaultValues?.order ?? 0}
                  className="h-10"
                />
                {state.fieldErrors?.order ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.order}</p>
                ) : null}
              </div>

              <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={isActive}
                  className="size-4 rounded border-slate-300"
                />
                활성 기수로 표시
              </label>
            </div>

            <div className="space-y-5 border-t border-slate-200 pt-5">
              <div className="space-y-2">
                <Label htmlFor="googleFormUrl">구글폼 URL</Label>
                <Input
                  id="googleFormUrl"
                  name="googleFormUrl"
                  placeholder="https://forms.google.com/..."
                  defaultValue={defaultValues?.googleFormUrl ?? ""}
                  className="h-10"
                />
                <p className="text-xs text-slate-500">
                  모집 상태가 &quot;모집중&quot;일 때 공개 모집 페이지의 &quot;지원하기&quot; 버튼이 이 링크로 연결됩니다.
                </p>
                {state.fieldErrors?.googleFormUrl ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.googleFormUrl}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="googleSheetId">구글 시트 ID</Label>
                <Input
                  id="googleSheetId"
                  name="googleSheetId"
                  placeholder="스프레드시트 URL에서 /d/ 뒤의 문자열"
                  defaultValue={defaultValues?.googleSheetId ?? ""}
                  className="h-10"
                />
                <p className="text-xs text-slate-500">
                  구글폼 응답이 저장되는 시트를 연동할 때 사용하는 값입니다. 비워둬도 저장할 수 있습니다.
                </p>
                {state.fieldErrors?.googleSheetId ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.googleSheetId}</p>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
              <Button variant="outline" render={<Link href="/admin/recruitment" />}>
                취소
              </Button>
              <Button type="submit" disabled={isPending} className="bg-slate-900 text-white hover:bg-slate-700">
                {isPending ? "저장 중..." : submitLabel}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
