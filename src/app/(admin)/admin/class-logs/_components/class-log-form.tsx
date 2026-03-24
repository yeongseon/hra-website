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
import { Textarea } from "@/components/ui/textarea";

type ClassLogActionResult = {
  success: boolean;
  error?: string;
};

type ClassLogFormProps = {
  action: (formData: FormData) => Promise<ClassLogActionResult>;
  cohorts: Array<{ id: string; name: string }>;
  defaultValues?: {
    title?: string;
    content?: string;
    classDate?: string;
    cohortId?: string | null;
  };
  submitLabel?: string;
  successMessage?: string;
};

const initialState: ClassLogActionResult = {
  success: false,
};

export function ClassLogForm({
  action,
  cohorts,
  defaultValues,
  submitLabel = "저장",
  successMessage = "저장되었습니다.",
}: ClassLogFormProps) {
  const router = useRouter();

  const [submissionState, submissionAction, isSubmitting] = useActionState(
    async (_previous: ClassLogActionResult, formData: FormData) => {
      return action(formData);
    },
    initialState
  );

  useEffect(() => {
    if (submissionState.success) {
      router.push("/admin/class-logs");
      router.refresh();
    }
  }, [router, submissionState.success]);

  return (
    <Card className="border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-slate-200 py-6">
        <CardTitle className="text-xl text-slate-900">수업일지 정보</CardTitle>
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
              <span>{successMessage}</span>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="title" className="text-slate-700">
              제목
            </Label>
            <Input
              id="title"
              name="title"
              required
              defaultValue={defaultValues?.title ?? ""}
              className="h-10 border-slate-300"
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="classDate" className="text-slate-700">
                수업 날짜
              </Label>
              <Input
                id="classDate"
                name="classDate"
                type="date"
                required
                defaultValue={defaultValues?.classDate ?? ""}
                className="h-10 border-slate-300"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cohortId" className="text-slate-700">
                기수
              </Label>
              <Select name="cohortId" defaultValue={defaultValues?.cohortId ?? "__none__"}>
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="content" className="text-slate-700">
              내용
            </Label>
            <Textarea
              id="content"
              name="content"
              required
              defaultValue={defaultValues?.content ?? ""}
              className="min-h-56 border-slate-300"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={isSubmitting} className="h-10 bg-slate-900 text-white">
              {isSubmitting ? "저장 중..." : submitLabel}
            </Button>
            <Button variant="outline" type="button" onClick={() => router.push("/admin/class-logs")}>
              취소
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
