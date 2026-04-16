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

type NoticeActionResult = {
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

type NoticeFormProps = {
  action: (formData: FormData) => Promise<NoticeActionResult>;
  defaultValues?: {
    title?: string;
    content?: string;
    status?: "DRAFT" | "PUBLISHED";
    pinned?: boolean;
  };
  submitLabel?: string;
  successMessage?: string;
};

const initialState: NoticeActionResult = {
  success: false,
  message: "",
};

export function NoticeForm({
  action,
  defaultValues,
  submitLabel = "저장",
  successMessage = "저장되었습니다.",
}: NoticeFormProps) {
  const router = useRouter();

  const [submissionState, submissionAction, isSubmitting] = useActionState(
    async (_previous: NoticeActionResult, formData: FormData) => {
      return action(formData);
    },
    initialState
  );

  useEffect(() => {
    if (submissionState.success) {
      router.push("/admin/notices");
      router.refresh();
    }
  }, [router, submissionState.success]);

  return (
    <Card className="border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-slate-200 py-6">
        <CardTitle className="text-xl text-slate-900">공지사항 정보</CardTitle>
      </CardHeader>
      <CardContent className="py-6">
        <form action={submissionAction} className="space-y-5">
          {!submissionState.success && submissionState.message ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 size-4" />
              <span>{submissionState.message}</span>
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
            {submissionState.fieldErrors?.title ? (
              <p className="text-sm text-red-600">{submissionState.fieldErrors.title}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="content" className="text-slate-700">
              내용
            </Label>
            <MarkdownEditor
              name="content"
              defaultValue={defaultValues?.content ?? ""}
              required
              placeholder="마크다운으로 작성하세요..."
            />
            {submissionState.fieldErrors?.content ? (
              <p className="text-sm text-red-600">{submissionState.fieldErrors.content}</p>
            ) : null}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="status" className="text-slate-700">
                상태
              </Label>
              <Select name="status" defaultValue={defaultValues?.status ?? "DRAFT"}>
                <SelectTrigger id="status" className="h-10 w-full border-slate-300 bg-white">
                  <SelectValue placeholder="상태를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">DRAFT</SelectItem>
                  <SelectItem value="PUBLISHED">PUBLISHED</SelectItem>
                </SelectContent>
              </Select>
              {submissionState.fieldErrors?.status ? (
                <p className="text-sm text-red-600">{submissionState.fieldErrors.status}</p>
              ) : null}
            </div>

            <div className="flex items-end pb-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="pinned"
                  defaultChecked={defaultValues?.pinned ?? false}
                  className="size-4 rounded border-slate-300"
                />
                상단 고정
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={isSubmitting} className="h-10 bg-slate-900 text-white">
              {isSubmitting ? "저장 중..." : submitLabel}
            </Button>
            <Button variant="outline" type="button" onClick={() => router.push("/admin/notices")}>
              취소
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
