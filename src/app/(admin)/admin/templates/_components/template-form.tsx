/**
 * 보고서 양식·가이드 작성 폼
 *
 * 역할: /admin/templates/new 와 /admin/templates/[id]/edit 에서 공통으로 사용하는 폼.
 *       Markdown 본문 + 메타(슬러그/제목/카테고리/분야/버전 등)를 입력받는다.
 *
 * 사용 위치:
 *   - src/app/(admin)/admin/templates/new/page.tsx
 *   - src/app/(admin)/admin/templates/[id]/edit/page.tsx
 */
"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { MarkdownEditor } from "@/components/admin/markdown-editor";
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

export type TemplateFormResult = {
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

type TemplateFormProps = {
  action: (formData: FormData) => Promise<TemplateFormResult>;
  defaultValues?: {
    slug?: string;
    title?: string;
    category?: "template" | "guide";
    reportCategory?: "management-book" | "classic-book" | "business-practice" | null;
    description?: string | null;
    version?: string;
    body?: string;
    published?: boolean;
    order?: number;
  };
  submitLabel?: string;
};

const initialState: TemplateFormResult = {
  success: false,
  message: "",
};

export function TemplateForm({
  action,
  defaultValues,
  submitLabel = "저장",
}: TemplateFormProps) {
  const router = useRouter();
  // 카테고리 변경 시 분야 코드 노출 여부를 클라이언트에서 즉시 반영
  const [category, setCategory] = useState<"template" | "guide">(
    defaultValues?.category ?? "template",
  );

  // 성공 시 서버 액션이 redirect("/admin/templates")로 이동을 처리하므로
  // 클라이언트에서는 오류 메시지/필드 오류만 다룬다.
  const [state, formAction, isSubmitting] = useActionState(
    async (_prev: TemplateFormResult, formData: FormData) => action(formData),
    initialState,
  );

  return (
    <Card className="border-[#D9D9D9] bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-[#D9D9D9] py-6">
        <CardTitle className="text-xl text-[#1a1a1a]">양식 정보</CardTitle>
      </CardHeader>
      <CardContent className="py-6">
        <form action={formAction} className="space-y-5">
          {!state.success && state.message ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 size-4" />
              <span>{state.message}</span>
            </div>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="slug" className="text-[#1a1a1a]">
                슬러그 (URL 식별자)
              </Label>
              <Input
                id="slug"
                name="slug"
                required
                defaultValue={defaultValues?.slug ?? ""}
                placeholder="management-book-template"
                className="h-10 border-[#D9D9D9]"
              />
              {state.fieldErrors?.slug ? (
                <p className="text-sm text-red-600">{state.fieldErrors.slug}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="version" className="text-[#1a1a1a]">
                버전
              </Label>
              <Input
                id="version"
                name="version"
                required
                defaultValue={defaultValues?.version ?? "1.0.0"}
                className="h-10 border-[#D9D9D9]"
              />
              {state.fieldErrors?.version ? (
                <p className="text-sm text-red-600">{state.fieldErrors.version}</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title" className="text-[#1a1a1a]">
              제목
            </Label>
            <Input
              id="title"
              name="title"
              required
              defaultValue={defaultValues?.title ?? ""}
              className="h-10 border-[#D9D9D9]"
            />
            {state.fieldErrors?.title ? (
              <p className="text-sm text-red-600">{state.fieldErrors.title}</p>
            ) : null}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category" className="text-[#1a1a1a]">
                구분
              </Label>
              <Select
                name="category"
                defaultValue={defaultValues?.category ?? "template"}
                onValueChange={(value) => setCategory(value as "template" | "guide")}
              >
                <SelectTrigger id="category" className="h-10 w-full border-[#D9D9D9] bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="template">양식 (template)</SelectItem>
                  <SelectItem value="guide">가이드 (guide)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reportCategory" className="text-[#1a1a1a]">
                분야 (양식일 때만)
              </Label>
              <Select
                name="reportCategory"
                defaultValue={defaultValues?.reportCategory ?? ""}
                disabled={category !== "template"}
              >
                <SelectTrigger
                  id="reportCategory"
                  className="h-10 w-full border-[#D9D9D9] bg-white"
                >
                  <SelectValue placeholder="분야를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="management-book">경영서</SelectItem>
                  <SelectItem value="classic-book">고전명작</SelectItem>
                  <SelectItem value="business-practice">기업실무·한국경제사</SelectItem>
                </SelectContent>
              </Select>
              {state.fieldErrors?.reportCategory ? (
                <p className="text-sm text-red-600">{state.fieldErrors.reportCategory}</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-[#1a1a1a]">
              설명 (목록 노출용, 선택)
            </Label>
            <Textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={defaultValues?.description ?? ""}
              className="border-[#D9D9D9]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body" className="text-[#1a1a1a]">
              본문 (Markdown)
            </Label>
            <MarkdownEditor
              name="body"
              defaultValue={defaultValues?.body ?? ""}
              required
              placeholder="마크다운으로 양식/가이드 본문을 작성하세요..."
            />
            {state.fieldErrors?.body ? (
              <p className="text-sm text-red-600">{state.fieldErrors.body}</p>
            ) : null}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="order" className="text-[#1a1a1a]">
                정렬 순서 (숫자가 작을수록 먼저)
              </Label>
              <Input
                id="order"
                name="order"
                type="number"
                min={0}
                max={9999}
                defaultValue={defaultValues?.order ?? 0}
                className="h-10 border-[#D9D9D9]"
              />
            </div>

            <div className="flex items-end pb-2">
              <label className="inline-flex items-center gap-2 text-sm text-[#1a1a1a]">
                <input
                  type="checkbox"
                  name="published"
                  defaultChecked={defaultValues?.published ?? true}
                  className="size-4 rounded border-[#D9D9D9]"
                />
                회원에게 공개
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-10 bg-[#1a1a1a] text-white hover:bg-[#333333]"
            >
              {isSubmitting ? "저장 중..." : submitLabel}
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => router.push("/admin/templates")}
            >
              취소
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
