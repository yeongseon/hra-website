"use client";

/**
 * 주차별 텍스트 수정 폼 컴포넌트
 *
 * 역할: 기존 주차별 텍스트를 수정하는 폼
 * - 마크다운 항목: 본문 편집 + 메타데이터 수정
 * - 파일 항목: 새 파일 업로드(선택)로 교체 + 메타데이터 수정
 */

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
import type { WeeklyTextActionState } from "@/features/weekly-texts/actions";
import { WEEKLY_TEXT_TYPE_VALUES } from "@/features/weekly-texts/constants";

type Props = {
  action: (formData: FormData) => Promise<WeeklyTextActionState>;
  cohorts: Array<{ id: string; name: string }>;
  defaultValues: {
    title: string;
    body: string;
    fileName: string | null;
    cohortId: string;
    textType: string;
    classDate: string;
    isMarkdown: boolean;
  };
};

const initialState: WeeklyTextActionState = { success: false };

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

export function WeeklyTextEditForm({ action, cohorts, defaultValues }: Props) {
  const router = useRouter();

  const [state, formAction, isSubmitting] = useActionState(
    async (_prev: WeeklyTextActionState, formData: FormData) => action(formData),
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      router.push("/admin/resources/weekly-texts");
      router.refresh();
    }
  }, [router, state.success]);

  const textTypeItems = [
    { value: "__none__", label: "분류 없음" },
    ...WEEKLY_TEXT_TYPE_VALUES.map((v) => ({ value: v, label: v })),
  ];

  const cohortItems = [
    { value: "__none__", label: "기수 선택" },
    ...cohorts.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <Card className="border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-slate-200 py-6">
        <CardTitle className="text-xl text-slate-900">주차별 텍스트 정보</CardTitle>
      </CardHeader>
      <CardContent className="py-6">
        <form action={formAction} className="space-y-5">
          {state.error ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 size-4" />
              <span>{state.error}</span>
            </div>
          ) : null}

          {state.success ? (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <CheckCircle2 className="mt-0.5 size-4" />
              <span>수정되었습니다.</span>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="title" className="text-slate-700">제목</Label>
            <Input
              id="title"
              name="title"
              required
              defaultValue={defaultValues.title}
              className="h-10 border-slate-300"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="classDate" className="text-slate-700">수업 날짜</Label>
            <Input
              id="classDate"
              name="classDate"
              type="date"
              defaultValue={defaultValues.classDate}
              className="h-10 border-slate-300"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="textType" className="text-slate-700">텍스트 분류</Label>
            <Select
              name="textType"
              items={textTypeItems}
              defaultValue={defaultValues.textType || "__none__"}
            >
              <SelectTrigger id="textType" className="h-10 w-full border-slate-300 bg-white">
                <SelectValue placeholder="분류를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {textTypeItems.map((item) => (
                  <SelectItem key={item.value} value={item.value} label={item.label}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cohortId" className="text-slate-700">기수</Label>
            <Select
              name="cohortId"
              items={cohortItems}
              defaultValue={defaultValues.cohortId || "__none__"}
            >
              <SelectTrigger id="cohortId" className="h-10 w-full border-slate-300 bg-white">
                <SelectValue placeholder="기수를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {cohortItems.map((item) => (
                  <SelectItem key={item.value} value={item.value} label={item.label}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {defaultValues.isMarkdown ? (
            <div className="space-y-2">
              <Label htmlFor="body" className="text-slate-700">마크다운 본문</Label>
              <Textarea
                id="body"
                name="body"
                defaultValue={defaultValues.body}
                className="min-h-[400px] border-slate-300 bg-white font-mono text-sm leading-6 text-[#1a1a1a]"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="file" className="text-slate-700">파일 교체 (선택)</Label>
              {defaultValues.fileName ? (
                <p className="text-sm text-slate-500">
                  현재 파일: <span className="font-medium text-slate-700">{defaultValues.fileName}</span>
                </p>
              ) : null}
              <Input
                id="file"
                name="file"
                type="file"
                accept={acceptValue}
                className="border-slate-300 bg-white"
              />
              <p className="text-sm text-slate-500">
                새 파일을 선택하면 기존 파일이 교체됩니다. 선택하지 않으면 기존 파일이 유지됩니다.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={isSubmitting} className="h-10 bg-slate-900 text-white">
              {isSubmitting ? "저장 중..." : "수정 저장"}
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
