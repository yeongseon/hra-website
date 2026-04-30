"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileUp, PenSquare } from "lucide-react";
import { useWeeklyTextUploadForm } from "@/components/resources/weekly-texts/use-weekly-text-upload-form";
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
import type { WeeklyTextActionState } from "@/features/weekly-texts/actions";
import { WEEKLY_TEXT_TYPE_VALUES } from "@/features/weekly-texts/constants";
import { cn } from "@/lib/utils";

type WeeklyTextFormProps = {
  action: (formData: FormData) => Promise<WeeklyTextActionState>;
  cohorts: Array<{ id: string; name: string }>;
};

const initialState: WeeklyTextActionState = {
  success: false,
};

const acceptValue = [
  ".pdf",
  ".hwp",
  ".doc",
  ".docx",
  "application/pdf",
  "application/x-hwp",
  "application/vnd.hancom.hwp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
].join(",");

export function WeeklyTextForm({ action, cohorts }: WeeklyTextFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedImageNames, setSelectedImageNames] = useState<string[]>([]);
  const {
    body,
    cohortId,
    fileInputRef,
    handleTextTypeChange,
    isTemplateLoading,
    resetForm,
    setBody,
    setCohortId,
    setTitle,
    switchUploadMode,
    templateError,
    textType,
    title,
    uploadMode,
  } = useWeeklyTextUploadForm();

  const textTypeSelectItems = [
    { value: "__none__", label: "분류 선택" },
    ...WEEKLY_TEXT_TYPE_VALUES.map((value) => ({ value, label: value })),
  ];
  const cohortSelectItems = [
    { value: "__none__", label: "기수 선택" },
    ...cohorts.map((cohort) => ({ value: cohort.id, label: cohort.name })),
  ];

  const [submissionState, submissionAction, isSubmitting] = useActionState(
    async (_previous: WeeklyTextActionState, formData: FormData) => action(formData),
    initialState,
  );

  useEffect(() => {
    if (submissionState.success) {
      formRef.current?.reset();
      resetForm();
      setSelectedImageNames([]);
      router.push("/admin/resources/weekly-texts");
      router.refresh();
    }
  }, [resetForm, router, submissionState.success]);

  return (
    <Card className="border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-slate-200 py-6">
        <CardTitle className="text-xl text-slate-900">주차별 텍스트 정보</CardTitle>
      </CardHeader>
      <CardContent className="py-6">
        <form ref={formRef} action={submissionAction} className="space-y-5">
          <input type="hidden" name="uploadMode" value={uploadMode} />

          {submissionState.error ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 size-4" />
              <span>{submissionState.error}</span>
            </div>
          ) : null}

          {submissionState.success ? (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <CheckCircle2 className="mt-0.5 size-4" />
              <span>주차별 텍스트가 저장되었습니다.</span>
            </div>
          ) : null}

          <div className="space-y-3">
            <span className="text-sm font-medium text-[#1a1a1a]">업로드 방식</span>
            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => switchUploadMode("file")}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
                  uploadMode === "file"
                    ? "border-[#2563EB] bg-blue-50 text-[#2563EB]"
                    : "border-[#D9D9D9] bg-white text-[#666666] hover:border-[#2563EB] hover:text-[#2563EB]",
                )}
              >
                <FileUp className="size-4" />
                <div>
                  <p className="text-sm font-semibold">파일 업로드</p>
                  <p className="text-xs leading-5">문서 파일을 그대로 등록합니다.</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => switchUploadMode("markdown")}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
                  uploadMode === "markdown"
                    ? "border-[#2563EB] bg-blue-50 text-[#2563EB]"
                    : "border-[#D9D9D9] bg-white text-[#666666] hover:border-[#2563EB] hover:text-[#2563EB]",
                )}
              >
                <PenSquare className="size-4" />
                <div>
                  <p className="text-sm font-semibold">마크다운 작성</p>
                  <p className="text-xs leading-5">최신 템플릿을 불러와 바로 등록합니다.</p>
                </div>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title" className="text-slate-700">
              제목
            </Label>
            <Input
              id="title"
              name="title"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-10 border-slate-300"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="textType" className="text-slate-700">
              텍스트 분류
            </Label>
            <Select
              name="textType"
              items={textTypeSelectItems}
              value={textType ?? "__none__"}
              onValueChange={handleTextTypeChange}
            >
              <SelectTrigger id="textType" className="h-10 w-full border-slate-300 bg-white">
                <SelectValue placeholder="분류를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {textTypeSelectItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cohortId" className="text-slate-700">
              기수
            </Label>
            <Select
              name="cohortId"
              items={cohortSelectItems}
              value={cohortId}
              onValueChange={(value) => setCohortId(value ?? "__none__")}
            >
              <SelectTrigger id="cohortId" className="h-10 w-full border-slate-300 bg-white">
                <SelectValue placeholder="기수를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {cohortSelectItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {uploadMode === "file" ? (
            <div className="space-y-2">
              <Label htmlFor="file" className="text-slate-700">
                파일
              </Label>
              <Input
                id="file"
                ref={fileInputRef}
                name="file"
                type="file"
                required
                accept={acceptValue}
                className="border-slate-300 bg-white"
              />
              <p className="text-sm text-slate-500">
                PDF, HWP, DOC, DOCX 파일만 업로드할 수 있으며 최대 용량은 30MB입니다.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="body" className="text-slate-700">
                마크다운 본문
              </Label>
              <Textarea
                id="body"
                name="body"
                value={isTemplateLoading ? "템플릿 불러오는 중..." : body}
                onChange={(event) => setBody(event.target.value)}
                disabled={isTemplateLoading}
                placeholder="분류를 선택하면 최신 템플릿이 자동으로 채워집니다. 직접 작성도 가능합니다."
                className="min-h-[400px] border-slate-300 bg-white font-mono text-sm leading-6 text-[#1a1a1a]"
              />
              <p className="text-sm text-slate-500">
                분류를 선택하면 최신 템플릿을 불러오며, 선택하지 않아도 직접 작성할 수 있습니다.
              </p>
              {templateError ? <p className="text-sm text-red-600">{templateError}</p> : null}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="images" className="text-slate-700">
              사진 첨부
            </Label>
            <Input
              id="images"
              name="images"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="border-slate-300 bg-white file:mr-4 file:rounded-full file:border-0 file:bg-[#2563EB]/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-[#2563EB] hover:file:bg-[#2563EB]/15"
              onChange={(event) => {
                setSelectedImageNames(Array.from(event.target.files ?? []).map((file) => file.name));
              }}
            />
            <p className="text-sm text-slate-500">
              문서 또는 마크다운 본문과 함께 사진을 여러 장 첨부할 수 있습니다. 각 파일은 10MB 이하여야
              합니다.
            </p>
            {selectedImageNames.length > 0 ? (
              <ul className="space-y-1 rounded-lg border border-[#D9D9D9] bg-gray-50 px-3 py-3 text-sm text-[#666666]">
                {selectedImageNames.map((name) => (
                  <li key={name} className="truncate">
                    {name}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="submit"
              disabled={isSubmitting || isTemplateLoading}
              className="h-10 bg-slate-900 text-white"
            >
              {isSubmitting ? "저장 중..." : uploadMode === "file" ? "주차별 텍스트 저장" : "마크다운 텍스트 저장"}
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => router.push("/admin/resources/weekly-texts")}
            >
              취소
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
