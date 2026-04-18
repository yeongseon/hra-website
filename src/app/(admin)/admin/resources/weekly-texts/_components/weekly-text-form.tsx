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
import type { WeeklyTextActionState } from "@/features/weekly-texts/actions";

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

  const [submissionState, submissionAction, isSubmitting] = useActionState(
    async (_previous: WeeklyTextActionState, formData: FormData) => action(formData),
    initialState,
  );

  useEffect(() => {
    if (submissionState.success) {
      router.push("/admin/resources/weekly-texts");
      router.refresh();
    }
  }, [router, submissionState.success]);

  return (
    <Card className="border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-slate-200 py-6">
        <CardTitle className="text-xl text-slate-900">주차별 텍스트 정보</CardTitle>
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
              <span>주차별 텍스트가 저장되었습니다.</span>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="title" className="text-slate-700">
              제목
            </Label>
            <Input id="title" name="title" required className="h-10 border-slate-300" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cohortId" className="text-slate-700">
              기수
            </Label>
            <Select name="cohortId" defaultValue="__none__">
              <SelectTrigger id="cohortId" className="h-10 w-full border-slate-300 bg-white">
                <SelectValue placeholder="기수를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">미선택</SelectItem>
                {cohorts.map((cohort) => (
                  <SelectItem key={cohort.id} value={cohort.id}>
                    {cohort.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              PDF, HWP, DOC, DOCX 파일만 업로드할 수 있으며 최대 용량은 30MB입니다.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={isSubmitting} className="h-10 bg-slate-900 text-white">
              {isSubmitting ? "저장 중..." : "주차별 텍스트 저장"}
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
