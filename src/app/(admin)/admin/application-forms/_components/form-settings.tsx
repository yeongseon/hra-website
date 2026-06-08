/**
 * 지원서 양식 기본 설정 컴포넌트
 */
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { updateForm, createForm } from "@/features/applications/actions/forms";

type FormSettingsProps = {
  form?: {
    id: string;
    title: string;
    description: string | null;
    cohortId: string | null;
    isPublished: boolean;
  };
  cohorts: { id: string; name: string }[];
};

export function FormSettings({ form, cohorts }: FormSettingsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = form 
        ? await updateForm(form.id, formData)
        : await createForm(formData);

      if (result.success) {
        toast.success(result.message);
        if (!form && result.id) {
          router.push(`/admin/application-forms/${result.id}`);
        } else {
          router.refresh();
        }
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <Card className="border-slate-200 shadow-sm bg-white">
      <CardHeader className="border-b border-slate-100 py-4">
        <CardTitle className="text-base font-semibold text-slate-900">
          {form ? "양식 기본 설정" : "새 지원서 양식 생성"}
        </CardTitle>
      </CardHeader>
      <CardContent className="py-6">
        <form action={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="title">양식 제목</Label>
            <Input 
              id="title" 
              name="title" 
              defaultValue={form?.title} 
              placeholder="예: 2025학년도 20기 신입회원 모집 지원서"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">양식 설명 (지원자에게 노출)</Label>
            <Textarea 
              id="description" 
              name="description" 
              defaultValue={form?.description || ""} 
              placeholder="지원 시 유의사항이나 안내 문구를 입력하세요."
              className="min-h-[100px] resize-none"
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cohortId">모집 기수 선택</Label>
              <Select name="cohortId" defaultValue={form?.cohortId || "none"}>
                <SelectTrigger id="cohortId">
                  <SelectValue placeholder="기수를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">기수 지정 안 함</SelectItem>
                  {cohorts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>공개 여부</Label>
              <div className="flex items-center gap-3 h-10 px-1">
                <Switch 
                  id="isPublished" 
                  name="isPublished" 
                  value="true" 
                  defaultChecked={form?.isPublished} 
                />
                <Label htmlFor="isPublished" className="text-sm font-normal text-slate-600 cursor-pointer">
                  {form?.isPublished ? "현재 공개 중" : "현재 비공개"}
                </Label>
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button type="submit" disabled={isPending} className="bg-slate-900 hover:bg-slate-700">
              <Save className="mr-2 size-4" />
              {isPending ? "저장 중..." : (form ? "설정 저장" : "양식 생성 후 질문 편집하기")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
