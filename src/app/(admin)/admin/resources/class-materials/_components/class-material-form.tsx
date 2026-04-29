"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
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
import type { ClassMaterialActionState } from "@/features/class-materials/actions";

type ClassMaterialFormProps = {
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

export function ClassMaterialForm({ action }: ClassMaterialFormProps) {
  const router = useRouter();

  const [submissionState, submissionAction, isSubmitting] = useActionState(
    async (_previous: ClassMaterialActionState, formData: FormData) => action(formData),
    initialState,
  );

  useEffect(() => {
    if (submissionState.success) {
      router.push("/admin/resources/class-materials");
      router.refresh();
    }
  }, [router, submissionState.success]);

  return (
    <Card className="border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-slate-200 py-6">
        <CardTitle className="text-xl text-slate-900">강의 자료 정보</CardTitle>
      </CardHeader>
      <CardContent className="py-6">
        <form action={submissionAction} className="space-y-5">
          {submissionState.error ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 size-4" />
              <span>{submissionState.error}</span>
            </div>
          ) : null}

          {submissionState.success ? (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <CheckCircle2 className="mt-0.5 size-4" />
              <span>강의 자료가 저장되었습니다.</span>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="title" className="text-slate-700">
              제목
            </Label>
            <Input id="title" name="title" required className="h-10 border-slate-300" />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="weekNumber" className="text-slate-700">
                주차
              </Label>
              <Input
                id="weekNumber"
                name="weekNumber"
                type="number"
                min={1}
                inputMode="numeric"
                className="h-10 border-slate-300"
                placeholder="예: 3"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="audience" className="text-slate-700">
                대상
              </Label>
              <Select name="audience" defaultValue="STUDENT">
                <SelectTrigger id="audience" className="h-10 w-full border-slate-300 bg-white">
                  <SelectValue placeholder="대상을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STUDENT">학생용</SelectItem>
                  <SelectItem value="FACULTY">교수용</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lectureTitle" className="text-slate-700">
              강의명
            </Label>
            <Input
              id="lectureTitle"
              name="lectureTitle"
              className="h-10 border-slate-300"
              placeholder="예: 현대 기업과 리더십"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="file" className="text-slate-700">
              파일
            </Label>
            <Input
              id="file"
              name="file"
              type="file"
              required
              accept={acceptValue}
              className="border-slate-300 bg-white"
            />
            <p className="text-sm text-slate-500">
              PDF, HWP, DOC, DOCX, PPT, PPTX 파일을 업로드할 수 있으며 최대 용량은 50MB입니다.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={isSubmitting} className="h-10 bg-slate-900 text-white">
              {isSubmitting ? "저장 중..." : "강의 자료 저장"}
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => router.push("/admin/resources/class-materials")}
            >
              취소
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
