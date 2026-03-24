"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
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
import type { CohortActionState } from "@/features/recruitment/actions";

type RecruitmentStatus = "UPCOMING" | "OPEN" | "CLOSED";

type CohortFormValues = {
  name?: string;
  description?: string | null;
  startDate?: string;
  endDate?: string;
  recruitmentStartDate?: string;
  recruitmentEndDate?: string;
  recruitmentStatus?: RecruitmentStatus;
  isActive?: boolean;
  order?: number;
};

type CohortFormProps = {
  title: string;
  description?: string;
  submitLabel: string;
  action: (formData: FormData) => Promise<CohortActionState | void>;
  defaultValues?: CohortFormValues;
};

const initialState: CohortActionState = {
  success: false,
  message: "",
};

const statusOptions: Array<{ value: RecruitmentStatus; label: string }> = [
  { value: "UPCOMING", label: "UPCOMING" },
  { value: "OPEN", label: "OPEN" },
  { value: "CLOSED", label: "CLOSED" },
];

export function CohortForm({ title, description, submitLabel, action, defaultValues }: CohortFormProps) {
  const [state, formAction, isPending] = useActionState(async (_prevState: CohortActionState, formData: FormData) => {
    const result = await action(formData);
    return result ?? initialState;
  }, initialState);

  const statusValue = defaultValues?.recruitmentStatus ?? "UPCOMING";
  const isActive = defaultValues?.isActive ?? true;

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 md:py-16">
      <Card className="border border-slate-200 bg-white py-0 text-slate-900 shadow-sm">
        <CardHeader className="space-y-2 border-b border-slate-200 py-6">
          <CardTitle className="text-2xl font-semibold text-slate-900">{title}</CardTitle>
          {description ? <p className="text-sm text-slate-600">{description}</p> : null}
        </CardHeader>
        <CardContent className="py-6">
          <form action={formAction} className="space-y-6">
            {state.message ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 size-4" />
                <span>{state.message}</span>
              </div>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="name">기수명</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  defaultValue={defaultValues?.name ?? ""}
                  className="h-10"
                />
                {state.fieldErrors?.name ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.name}</p>
                ) : null}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">설명</Label>
                <Textarea
                  id="description"
                  name="description"
                  defaultValue={defaultValues?.description ?? ""}
                  className="min-h-28"
                />
                {state.fieldErrors?.description ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.description}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="startDate">기수 시작일</Label>
                <Input
                  id="startDate"
                  name="startDate"
                  type="date"
                  defaultValue={defaultValues?.startDate ?? ""}
                  className="h-10"
                />
                {state.fieldErrors?.startDate ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.startDate}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="endDate">기수 종료일</Label>
                <Input
                  id="endDate"
                  name="endDate"
                  type="date"
                  defaultValue={defaultValues?.endDate ?? ""}
                  className="h-10"
                />
                {state.fieldErrors?.endDate ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.endDate}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="recruitmentStartDate">모집 시작일</Label>
                <Input
                  id="recruitmentStartDate"
                  name="recruitmentStartDate"
                  type="date"
                  defaultValue={defaultValues?.recruitmentStartDate ?? ""}
                  className="h-10"
                />
                {state.fieldErrors?.recruitmentStartDate ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.recruitmentStartDate}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="recruitmentEndDate">모집 종료일</Label>
                <Input
                  id="recruitmentEndDate"
                  name="recruitmentEndDate"
                  type="date"
                  defaultValue={defaultValues?.recruitmentEndDate ?? ""}
                  className="h-10"
                />
                {state.fieldErrors?.recruitmentEndDate ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.recruitmentEndDate}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="recruitmentStatus">모집 상태</Label>
                <Select name="recruitmentStatus" defaultValue={statusValue}>
                  <SelectTrigger id="recruitmentStatus" className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {state.fieldErrors?.recruitmentStatus ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.recruitmentStatus}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="order">정렬 순서</Label>
                <Input
                  id="order"
                  name="order"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={defaultValues?.order ?? 0}
                  className="h-10"
                />
                {state.fieldErrors?.order ? (
                  <p className="text-xs text-red-600">{state.fieldErrors.order}</p>
                ) : null}
              </div>

              <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={isActive}
                  className="size-4 rounded border-slate-300"
                />
                활성 기수로 표시
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
              <Button variant="outline" render={<Link href="/admin/recruitment" />}>
                취소
              </Button>
              <Button type="submit" disabled={isPending} className="bg-slate-900 text-white hover:bg-slate-700">
                {isPending ? "저장 중..." : submitLabel}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
