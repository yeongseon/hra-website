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
import { MarkdownEditor } from "@/components/admin/markdown-editor";
import type { ClassLogActionState } from "@/features/class-logs/actions";
import { cn } from "@/lib/utils";

type MemberClassLogUploadFormProps = {
  action: (formData: FormData) => Promise<ClassLogActionState>;
  cohorts: Array<{ id: string; name: string }>;
  userCohortId?: string | null;
};

const initialState: ClassLogActionState = { success: false };

export function MemberClassLogUploadForm({
  action,
  cohorts,
  userCohortId,
}: MemberClassLogUploadFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [submissionState, submissionAction, isSubmitting] = useActionState(
    async (_previous: ClassLogActionState, formData: FormData) => action(formData),
    initialState,
  );

  useEffect(() => {
    if (!submissionState.success) return;
    formRef.current?.reset();
    router.refresh();
  }, [router, submissionState.success]);

  const cohortSelectItems = [
    { value: "__none__", label: "미선택" },
    ...cohorts.map((cohort) => ({ value: cohort.id, label: cohort.name })),
  ];

  return (
    <Card className="overflow-hidden rounded-[28px] border-[#D9D9D9] bg-white py-0 shadow-[var(--shadow-soft)]">
      <CardHeader className="border-b border-[#D9D9D9] bg-[linear-gradient(135deg,rgba(37,99,235,0.08),rgba(255,255,255,0.96))] py-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-2xl font-semibold tracking-tight text-[#1a1a1a]">
              수업일지 업로드
            </CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-6 text-[#666666]">
              수업 내용을 마크다운으로 작성해 등록하세요. 승인된 회원만 업로드할 수 있습니다.
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
                  ? "수업일지가 등록되었습니다. 목록을 새로 불러오는 중입니다."
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
                placeholder="예: 5주차 수업일지"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="classDate" className="text-[#1a1a1a]">
                수업 날짜
              </Label>
              <Input
                id="classDate"
                name="classDate"
                type="date"
                required
                className="h-11 border-[#D9D9D9] bg-white text-[#1a1a1a]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cohortId" className="text-[#1a1a1a]">
              기수
            </Label>
            {userCohortId ? (
              <>
                <input type="hidden" name="cohortId" value={userCohortId} />
                <Select
                  disabled
                  items={cohorts.map((cohort) => ({ value: cohort.id, label: cohort.name }))}
                  value={userCohortId}
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
              <Select name="cohortId" items={cohortSelectItems} defaultValue="__none__">
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

          <div className="space-y-2">
            <Label htmlFor="content" className="text-[#1a1a1a]">
              수업 내용
            </Label>
            <MarkdownEditor
              id="content"
              name="content"
              placeholder="수업에서 다룬 내용, 토론 결과, 핵심 키워드 등을 마크다운으로 작성하세요."
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[#666666]">
              등록한 수업일지는 즉시 전체 회원 목록에 반영됩니다.
            </p>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-11 rounded-full bg-[#1a1a1a] px-6 text-white hover:bg-[#333333]"
            >
              {isSubmitting ? "등록 중..." : "수업일지 등록하기"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
