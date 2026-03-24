/**
 * 갤러리 앨범 정보 폼 컴포넌트 (클라이언트 컴포넌트)
 *
 * 역할: 앨범 제목, 설명, 커버 이미지 URL을 입력하는 폼
 * - 새 앨범 생성 또는 기존 앨범 수정에 사용
 * - 성공/실패 메시지 표시
 *
 * 📌 클라이언트 컴포넌트 이유: 폼 제출, 상태 관리 필요
 */

"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { GalleryActionState } from "@/features/gallery/actions";

const initialState: GalleryActionState = {
  success: false,
  message: "",
};

type GalleryFormValues = {
  title?: string | null;
  description?: string | null;
  coverImageUrl?: string | null;
};

type GalleryFormProps = {
  action: (formData: FormData) => Promise<GalleryActionState>;
  submitLabel: string;
  defaultValues?: GalleryFormValues;
  successRedirectPath?: string;
};

export function GalleryForm({
  action,
  submitLabel,
  defaultValues,
  successRedirectPath,
}: GalleryFormProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    // ⚙️ 서버 액션 호출 - 갤러리 정보를 서버로 전송하여 DB 저장/수정
    async (_prevState: GalleryActionState, formData: FormData) => action(formData),
    initialState
  );

  useEffect(() => {
    if (!state.success || !successRedirectPath) {
      return;
    }

    router.push(successRedirectPath);
  }, [router, state.success, successRedirectPath]);

  return (
    <Card className="border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-slate-100 py-6">
        <CardTitle className="text-xl text-slate-900">앨범 정보</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 py-6">
        <form action={formAction} className="space-y-5">
          {state.message ? (
            <div
              className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
                state.success
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {state.success ? (
                <CheckCircle2 className="mt-0.5 size-4" />
              ) : (
                <AlertCircle className="mt-0.5 size-4" />
              )}
              <span>{state.message}</span>
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
              className="border-slate-200"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-slate-700">
              설명
            </Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={defaultValues?.description ?? ""}
              className="min-h-32 border-slate-200"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="coverImageUrl" className="text-slate-700">
              커버 이미지 URL
            </Label>
            {/* TODO: Replace with Vercel Blob upload */}
            <Input
              id="coverImageUrl"
              name="coverImageUrl"
              type="url"
              placeholder="https://example.com/cover.jpg"
              defaultValue={defaultValues?.coverImageUrl ?? ""}
              className="border-slate-200"
            />
          </div>

          <CardFooter className="px-0 pb-0 pt-2">
            <Button type="submit" disabled={isPending} className="bg-slate-900 hover:bg-slate-700">
              {isPending ? "저장 중..." : submitLabel}
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
