"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileUp, PenSquare, Upload } from "lucide-react";
import { useWeeklyTextUploadForm } from "@/components/resources/weekly-texts/use-weekly-text-upload-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

type MemberUploadFormProps = {
  action: (formData: FormData) => Promise<WeeklyTextActionState>;
  cohorts: Array<{ id: string; name: string }>;
  userCohortId?: string | null; // MEMBER일 때 기수 드롭다운 고정에 사용
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

export function MemberUploadForm({ action, cohorts, userCohortId }: MemberUploadFormProps) {
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
  } = useWeeklyTextUploadForm({ initialCohortId: userCohortId ?? null });

  const textTypeSelectItems = [
    { value: "__none__", label: "미선택" },
    ...WEEKLY_TEXT_TYPE_VALUES.map((value) => ({ value, label: value })),
  ];
  const cohortSelectItems = [
    { value: "__none__", label: "미선택" },
    ...cohorts.map((cohort) => ({ value: cohort.id, label: cohort.name })),
  ];

  const [submissionState, submissionAction, isSubmitting] = useActionState(
    async (_previous: WeeklyTextActionState, formData: FormData) => action(formData),
    initialState,
  );

  useEffect(() => {
    if (!submissionState.success) {
      return;
    }

    formRef.current?.reset();
    resetForm();
    setSelectedImageNames([]);
    router.refresh();
  }, [resetForm, router, submissionState.success]);

  return (
    <Card className="overflow-hidden rounded-[28px] border-[#D9D9D9] bg-white py-0 shadow-[var(--shadow-soft)]">
      <CardHeader className="border-b border-[#D9D9D9] bg-[linear-gradient(135deg,rgba(37,99,235,0.08),rgba(255,255,255,0.96))] py-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-2xl font-semibold tracking-tight text-[#1a1a1a]">
              주차별 텍스트 업로드
            </CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-6 text-[#666666]">
              수업 자료를 바로 공유할 수 있도록 업로드 영역을 열어두었습니다. 승인된 회원만
              파일 업로드 또는 마크다운 작성으로 자료를 등록할 수 있습니다.
            </CardDescription>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#D9D9D9] bg-white/90 px-3 py-1.5 text-xs font-medium text-[#2563EB]">
            <Upload className="size-3.5" />
            회원 업로드 가능
          </div>
        </div>
      </CardHeader>

      <CardContent className="py-6">
        <form ref={formRef} action={submissionAction} className="space-y-5">
          <input type="hidden" name="uploadMode" value={uploadMode} />

          {(submissionState.error || submissionState.success) && (
            <div
              className={cn(
                "flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm",
                submissionState.success
                  ? "border-blue-200 bg-blue-50 text-[#2563EB]"
                  : "border-red-200 bg-red-50 text-red-700",
              )}
            >
              {submissionState.success ? (
                <CheckCircle2 className="mt-0.5 size-4" />
              ) : (
                <AlertCircle className="mt-0.5 size-4" />
              )}
              <span>
                {submissionState.success
                  ? "주차별 텍스트가 업로드되었습니다. 목록을 새로 불러오는 중입니다."
                  : submissionState.error}
              </span>
            </div>
          )}

          <div className="space-y-3">
            <span className="text-sm font-medium text-[#1a1a1a]">업로드 방식</span>
            <div className="grid gap-3 sm:grid-cols-2">
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
                  <p className="text-xs leading-5">PDF, HWP, DOC, DOCX 파일을 그대로 올립니다.</p>
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
                  <p className="text-xs leading-5">최신 템플릿을 불러와 바로 작성해서 등록합니다.</p>
                </div>
              </button>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-[#1a1a1a]">
                제목
              </Label>
              <Input
                id="title"
                name="title"
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="h-11 border-[#D9D9D9] bg-white text-[#1a1a1a]"
                placeholder="예: 3주차 읽기 자료"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="textType" className="text-[#1a1a1a]">
                텍스트 분류
              </Label>
              <Select
                name="textType"
                items={textTypeSelectItems}
                value={textType ?? "__none__"}
                onValueChange={handleTextTypeChange}
              >
                <SelectTrigger id="textType" className="h-11 w-full border-[#D9D9D9] bg-white text-[#1a1a1a]">
                  <SelectValue placeholder="분류 선택" />
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="cohortId" className="text-[#1a1a1a]">
              기수
            </Label>
            {userCohortId ? (
              <>
                <input type="hidden" name="cohortId" value={cohortId} />
                <Select
                  disabled
                  items={cohorts.map((cohort) => ({ value: cohort.id, label: cohort.name }))}
                  value={cohortId}
                >
                  <SelectTrigger id="cohortId" className="h-11 w-full border-[#D9D9D9] bg-gray-50 text-[#666666]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cohorts.map((cohort) => (
                      <SelectItem key={cohort.id} value={cohort.id}>
                        {cohort.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : (
              <Select
                name="cohortId"
                items={cohortSelectItems}
                value={cohortId}
                onValueChange={(value) => setCohortId(value ?? "__none__")}
              >
                <SelectTrigger id="cohortId" className="h-11 w-full border-[#D9D9D9] bg-white text-[#1a1a1a]">
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
            )}
          </div>

          {uploadMode === "file" ? (
            <div className="space-y-2">
              <Label htmlFor="file" className="text-[#1a1a1a]">
                파일
              </Label>
              <Input
                id="file"
                ref={fileInputRef}
                name="file"
                type="file"
                required
                accept={acceptValue}
                className="border-[#D9D9D9] bg-white text-[#1a1a1a] file:mr-4 file:rounded-full file:border-0 file:bg-[#2563EB]/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-[#2563EB] hover:file:bg-[#2563EB]/15"
              />
              <p className="text-sm leading-6 text-[#666666]">
                PDF, HWP, DOC, DOCX 파일만 업로드할 수 있으며 최대 용량은 30MB입니다.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="body" className="text-[#1a1a1a]">
                마크다운 본문
              </Label>
              <Textarea
                id="body"
                name="body"
                value={isTemplateLoading ? "템플릿 불러오는 중..." : body}
                onChange={(event) => setBody(event.target.value)}
                disabled={isTemplateLoading}
                placeholder="분류를 선택하면 최신 템플릿이 자동으로 채워집니다. 직접 작성도 가능합니다."
                className="min-h-[400px] border-[#D9D9D9] bg-white font-mono text-sm leading-6 text-[#1a1a1a]"
              />
              <p className="text-sm leading-6 text-[#666666]">
                분류를 선택하면 최신 템플릿을 불러오며, 선택하지 않아도 직접 작성할 수 있습니다.
              </p>
              {templateError ? <p className="text-sm text-red-600">{templateError}</p> : null}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="images" className="text-[#1a1a1a]">
              사진 첨부
            </Label>
            <Input
              id="images"
              name="images"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="border-[#D9D9D9] bg-white text-[#1a1a1a] file:mr-4 file:rounded-full file:border-0 file:bg-[#2563EB]/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-[#2563EB] hover:file:bg-[#2563EB]/15"
              onChange={(event) => {
                setSelectedImageNames(Array.from(event.target.files ?? []).map((file) => file.name));
              }}
            />
            <p className="text-sm leading-6 text-[#666666]">
              문서 또는 마크다운 본문과 함께 사진을 여러 장 첨부할 수 있습니다. 각 파일은 10MB
              이하여야 합니다.
            </p>
            {selectedImageNames.length > 0 ? (
              <ul className="space-y-1 rounded-2xl border border-[#D9D9D9] bg-gray-50 px-3 py-3 text-sm text-[#666666]">
                {selectedImageNames.map((name) => (
                  <li key={name} className="truncate">
                    {name}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[#666666]">
              업로드한 자료는 즉시 전체 회원 목록에 반영됩니다.
            </p>
            <Button
              type="submit"
              disabled={isSubmitting || isTemplateLoading}
              className="h-11 rounded-full bg-[#1a1a1a] px-6 text-white hover:bg-[#333333]"
            >
              {isSubmitting ? "업로드 중..." : uploadMode === "file" ? "주차별 텍스트 올리기" : "마크다운 텍스트 저장하기"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
