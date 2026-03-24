/**
 * 갤러리 이미지 추가 폼 컴포넌트 (클라이언트 컴포넌트)
 *
 * 역할: 앨범에 이미지를 추가하는 폼
 * - 이미지 URL, 대체 텍스트(alt), 정렬 순서 입력
 * - Vercel Blob 업로드 기능 (TODO로 표시됨 - 아직 미구현)
 * - 현재는 URL 수동 입력 방식 사용
 *
 * 📌 클라이언트 컴포넌트 이유: 폼 제출, 상태 관리 필요
 * 
 * 📌 Vercel Blob 이미지 업로드 흐름 (향후 구현 예정):
 * 1. 사용자가 이미지 파일 선택
 * 2. 클라이언트에서 Vercel Blob API로 파일 업로드
 * 3. Blob에서 이미지 URL 반환
 * 4. 반환된 URL을 폼에 자동으로 채우고 서버 액션 호출
 * 5. DB에 이미지 정보 저장
 */

"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GalleryActionState } from "@/features/gallery/actions";

const initialState: GalleryActionState = {
  success: false,
  message: "",
};

type GalleryImageFormProps = {
  galleryId: string;
  action: (formData: FormData) => Promise<GalleryActionState>;
};

export function GalleryImageForm({ galleryId, action }: GalleryImageFormProps) {
  const [state, formAction, isPending] = useActionState(
    // ⚙️ 서버 액션 호출 - 폼 데이터를 서버로 전송하여 이미지 추가
    async (_prevState: GalleryActionState, formData: FormData) => {
      const nextFormData = new FormData();

      for (const [key, value] of formData.entries()) {
        nextFormData.append(key, value);
      }

      // 🔑 갤러리 ID를 폼 데이터에 추가 (어느 앨범에 이미지를 추가할지 식별)
      nextFormData.set("galleryId", galleryId);
      return action(nextFormData);
    },
    initialState
  );

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="url" className="text-slate-700">
            이미지 URL
          </Label>
          {/* TODO: Replace with Vercel Blob upload */}
          <Input
            id="url"
            name="url"
            type="url"
            required
            placeholder="https://example.com/image.jpg"
            className="border-slate-200 bg-white"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="order" className="text-slate-700">
            정렬 순서
          </Label>
          <Input
            id="order"
            name="order"
            type="number"
            min={0}
            defaultValue={0}
            className="border-slate-200 bg-white"
          />
        </div>

        <div className="space-y-2 md:col-span-3">
          <Label htmlFor="alt" className="text-slate-700">
            대체 텍스트
          </Label>
          <Input
            id="alt"
            name="alt"
            placeholder="이미지 설명"
            className="border-slate-200 bg-white"
          />
        </div>
      </div>

      <Button type="submit" disabled={isPending} className="bg-slate-900 hover:bg-slate-700">
        <Plus className="mr-1 size-4" />
        {isPending ? "추가 중..." : "이미지 추가"}
      </Button>
    </form>
  );
}
