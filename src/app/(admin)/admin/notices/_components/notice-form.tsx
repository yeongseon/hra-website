/**
 * 공지사항 폼 컴포넌트 (NoticeForm)
 * 
 * 클라이언트 컴포넌트 — 공지사항 생성 및 수정 폼입니다.
 * _components 폴더: 이 폴더의 컴포넌트들은 notices 폴더 안에서만 사용됩니다.
 * 
 * 이 폼은 다목적으로 사용됩니다:
 * 1. 새 공지 작성 (new/page.tsx) — defaultValues 없음, createNotice 액션
 * 2. 공지 수정 (edit/page.tsx) — defaultValues 있음, updateNotice 액션
 * 
 * props 설명:
 * - action: 폼 제출 시 실행할 서버 액션 함수 (createNotice 또는 updateNotice)
 * - defaultValues?: 폼에 미리 표시할 기존 데이터 (수정 시에만 전달)
 * - submitLabel?: 제출 버튼에 표시할 텍스트
 * - successMessage?: 저장 성공 시 표시할 메시지
 * 
 * "use client" 필수 — 클라이언트 컴포넌트 개념
 * 이 컴포넌트는 useActionState, useEffect 등 클라이언트 훅을 사용하므로
 * 클라이언트에서 실행되어야 합니다.
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

// 서버 액션의 반환 타입 정의
type NoticeActionResult = {
  success: boolean;
  error?: string;
};

// 컴포넌트의 props 타입 정의
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

// 폼의 초기 상태: 성공하지 않은 상태
const initialState: NoticeActionResult = {
  success: false,
};

export function NoticeForm({
  action,
  defaultValues,
  submitLabel = "저장",
  successMessage = "저장되었습니다.",
}: NoticeFormProps) {
  const router = useRouter();

  // useActionState — 서버 액션 상태 관리 훅
  // 반환값: [현재 상태, 서버 액션 실행 함수, 요청 진행 중 여부]
  // 폼 제출 시 submissionAction 함수가 action(formData)을 호출
  const [submissionState, submissionAction, isSubmitting] = useActionState(
    async (_previous: NoticeActionResult, formData: FormData) => {
      return action(formData);
    },
    initialState
  );

  // useEffect — 저장 성공 후 자동으로 목록 페이지로 이동
  // 의존성 배열 [router, submissionState.success]가 변하면 실행
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
        {/* 폼: action prop으로 서버 액션을 전달, 제출 시 자동 실행 */}
        <form action={submissionAction} className="space-y-5">
          {/* 에러 메시지 표시 */}
          {submissionState.error ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 size-4" />
              <span>{submissionState.error}</span>
            </div>
          ) : null}

          {/* 성공 메시지 표시 */}
          {submissionState.success ? (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <CheckCircle2 className="mt-0.5 size-4" />
              <span>{successMessage}</span>
            </div>
          ) : null}

          {/* 제목 입력 필드 */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-slate-700">
              제목
            </Label>
            <Input
              id="title"
              name="title"
              required
              // defaultValue — 수정 시 기존 제목을 폼에 미리 표시
              // 새 공지는 defaultValues가 없으므로 빈 문자열
              defaultValue={defaultValues?.title ?? ""}
              className="h-10 border-slate-300"
            />
          </div>

          {/* 내용 입력 필드 */}
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
          </div>

          {/* 상태 선택 + 고정 체크박스 */}
          <div className="grid gap-5 md:grid-cols-2">
            {/* 상태 선택: DRAFT(임시저장) 또는 PUBLISHED(게시됨) */}
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
            </div>

            {/* 상단 고정 체크박스 */}
            <div className="flex items-end pb-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="pinned"
                  // defaultChecked — 수정 시 기존 고정 상태를 폼에 미리 표시
                  defaultChecked={defaultValues?.pinned ?? false}
                  className="size-4 rounded border-slate-300"
                />
                상단 고정
              </label>
            </div>
          </div>

          {/* 제출 버튼들 */}
          <div className="flex items-center gap-2">
            {/* 저장 버튼: 요청 진행 중이면 비활성화 + 로딩 텍스트 표시 */}
            <Button type="submit" disabled={isSubmitting} className="h-10 bg-slate-900 text-white">
              {isSubmitting ? "저장 중..." : submitLabel}
            </Button>
            {/* 취소 버튼: 목록으로 돌아가기 */}
            <Button variant="outline" type="button" onClick={() => router.push("/admin/notices")}>
              취소
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
