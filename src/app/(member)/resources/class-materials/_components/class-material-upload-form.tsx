"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Upload } from "lucide-react";
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
import type { ClassMaterialActionState } from "@/features/class-materials/actions";
import { cn } from "@/lib/utils";

type ClassMaterialUploadFormProps = {
  action: (formData: FormData) => Promise<ClassMaterialActionState>;
};

const initialState: ClassMaterialActionState = {
  success: false,
};

const acceptValue = [
  ".pdf",
  ".hwp",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  "application/pdf",
  "application/x-hwp",
  "application/vnd.hancom.hwp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
].join(",");

export function ClassMaterialUploadForm({ action }: ClassMaterialUploadFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [submissionState, submissionAction, isSubmitting] = useActionState(
    async (_previous: ClassMaterialActionState, formData: FormData) => action(formData),
    initialState,
  );

  useEffect(() => {
    if (!submissionState.success) {
      return;
    }

    formRef.current?.reset();
    router.refresh();
  }, [router, submissionState.success]);

  return (
    <Card className="overflow-hidden rounded-[28px] border-[#D9D9D9] bg-white py-0 shadow-[var(--shadow-soft)]">
      <CardHeader className="border-b border-[#D9D9D9] bg-[linear-gradient(135deg,rgba(37,99,235,0.08),rgba(255,255,255,0.96))] py-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-2xl font-semibold tracking-tight text-[#1a1a1a]">
              강의 자료 업로드
            </CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-6 text-[#666666]">
              교수진과 운영진이 수업 자료를 빠르게 공유할 수 있도록 업로드 영역을 제공합니다.
            </CardDescription>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#D9D9D9] bg-white/90 px-3 py-1.5 text-xs font-medium text-[#2563EB]">
            <Upload className="size-3.5" />
            교수·관리자 업로드 가능
          </div>
        </div>
      </CardHeader>

      <CardContent className="py-6">
        <form ref={formRef} action={submissionAction} className="space-y-5">
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
                  ? "강의 자료가 업로드되었습니다. 목록을 새로 불러오는 중입니다."
                  : submissionState.error}
              </span>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-[#1a1a1a]">
                제목
              </Label>
              <Input
                id="title"
                name="title"
                required
                className="h-11 border-[#D9D9D9] bg-white text-[#1a1a1a]"
                placeholder="예: 5주차 특강 발표 자료"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="weekNumber" className="text-[#1a1a1a]">
                주차
              </Label>
              <Input
                id="weekNumber"
                name="weekNumber"
                type="number"
                min={1}
                inputMode="numeric"
                className="h-11 border-[#D9D9D9] bg-white text-[#1a1a1a]"
                placeholder="예: 5"
              />
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-2">
              <Label htmlFor="lectureTitle" className="text-[#1a1a1a]">
                강의명
              </Label>
              <Input
                id="lectureTitle"
                name="lectureTitle"
                className="h-11 border-[#D9D9D9] bg-white text-[#1a1a1a]"
                placeholder="예: 디지털 전환과 조직 혁신"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="audience" className="text-[#1a1a1a]">
                대상
              </Label>
              <Select name="audience" defaultValue="STUDENT">
                <SelectTrigger id="audience" className="h-11 w-full border-[#D9D9D9] bg-white text-[#1a1a1a]">
                  <SelectValue placeholder="대상 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STUDENT">학생용</SelectItem>
                  <SelectItem value="FACULTY">교수용</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="file" className="text-[#1a1a1a]">
              파일
            </Label>
            <Input
              id="file"
              name="file"
              type="file"
              required
              accept={acceptValue}
              className="border-[#D9D9D9] bg-white text-[#1a1a1a] file:mr-4 file:rounded-full file:border-0 file:bg-[#2563EB]/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-[#2563EB] hover:file:bg-[#2563EB]/15"
            />
            <p className="text-sm leading-6 text-[#666666]">
              PDF, HWP, DOC, DOCX, PPT, PPTX 파일만 업로드할 수 있으며 최대 용량은 50MB입니다.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[#666666]">업로드한 자료는 자료실 강의 자료 탭에 즉시 반영됩니다.</p>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-11 rounded-full bg-[#1a1a1a] px-6 text-white hover:bg-[#333333]"
            >
              {isSubmitting ? "업로드 중..." : "강의 자료 올리기"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
