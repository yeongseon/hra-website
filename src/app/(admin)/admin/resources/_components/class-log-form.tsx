/**
 * 수업일지 입력 폼 컴포넌트 (클라이언트 컴포넌트)
 *
 * 역할: 수업일지를 작성하거나 수정하는 폼을 렌더링
 * - 제목, 수업 날짜, 기수, 내용 입력 필드
 * - 서버 액션을 호출하여 DB에 저장
 * - 성공/실패 메시지 표시
 *
 * 📌 "use client" 컴포넌트란?
 * - 기본적으로 모든 React 컴포넌트는 서버에서 HTML로 미리 그려서 내려줍니다 (빠름)
 * - 하지만 버튼 클릭, 입력창 입력 같이 사용자와 상호작용이 필요한 경우 "use client" 표시
 * - 이 컴포넌트는 form 제출, 상태 관리 등이 필요하므로 클라이언트 컴포넌트
 */

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
import { MarkdownEditor } from "@/components/admin/markdown-editor";

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
    // ⚙️ 서버 액션 호출 - 폼 데이터를 서버로 전송
    // FormData 객체를 받아서 action 함수 실행 (DB 저장 처리)
    async (_previous: ClassLogActionResult, formData: FormData) => {
      return action(formData);
    },
    initialState
  );

  useEffect(() => {
    if (submissionState.success) {
      router.push("/admin/resources");
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
            <MarkdownEditor
              id="content"
              name="content"
              defaultValue={defaultValues?.content ?? ""}
              required
              placeholder="마크다운으로 수업 내용을 작성해주세요..."
            />
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={isSubmitting} className="h-10 bg-slate-900 text-white">
              {isSubmitting ? "저장 중..." : submitLabel}
            </Button>
            <Button variant="outline" type="button" onClick={() => router.push("/admin/resources")}>
              취소
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
