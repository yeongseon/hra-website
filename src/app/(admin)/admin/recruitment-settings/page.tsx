"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getRecruitmentSettings,
  updateRecruitmentSettings,
  type RecruitmentSettingsActionState,
} from "@/features/recruitment-settings/actions";

type RecruitmentSettingsFormValues = {
  posterImageUrl: string;
  deadlineDate: string;
  nextRecruitmentYear: string;
  nextRecruitmentMonth: string;
  qualificationText: string;
};

const emptyFormValues: RecruitmentSettingsFormValues = {
  posterImageUrl: "",
  deadlineDate: "",
  nextRecruitmentYear: "",
  nextRecruitmentMonth: "",
  qualificationText: "",
};

function formatDateForInput(date: Date | null) {
  if (!date) {
    return "";
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function AdminRecruitmentSettingsPage() {
  const [formValues, setFormValues] = useState<RecruitmentSettingsFormValues>(emptyFormValues);
  const [messageState, setMessageState] = useState<RecruitmentSettingsActionState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, startLoadingTransition] = useTransition();
  const [isSaving, startSavingTransition] = useTransition();

  useEffect(() => {
    startLoadingTransition(() => {
      void getRecruitmentSettings()
        .then((settings) => {
          if (!settings) {
            setFormValues(emptyFormValues);
            return;
          }

          setFormValues({
            posterImageUrl: settings.posterImageUrl ?? "",
            deadlineDate: formatDateForInput(settings.deadlineDate),
            nextRecruitmentYear: settings.nextRecruitmentYear?.toString() ?? "",
            nextRecruitmentMonth: settings.nextRecruitmentMonth?.toString() ?? "",
            qualificationText: settings.qualificationText ?? "",
          });
        })
        .catch(() => {
          setLoadError("현재 모집 설정을 불러오지 못했습니다.");
        });
    });
  }, []);

  const handleChange = (field: keyof RecruitmentSettingsFormValues, value: string) => {
    setFormValues((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async (formData: FormData) => {
    setMessageState(null);
    setLoadError(null);

    const result = await updateRecruitmentSettings(formData);
    setMessageState(result);
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 md:py-16">
      <Card className="border border-slate-200 bg-white py-0 text-slate-900 shadow-sm">
        <CardHeader className="space-y-2 border-b border-slate-200 py-6">
          <CardTitle className="text-2xl font-semibold text-slate-900">모집 설정 관리</CardTitle>
          <p className="text-sm text-slate-600">모집 포스터와 D-day 기준 정보를 한 곳에서 관리하세요.</p>
        </CardHeader>
        <CardContent className="py-6">
          <form
            action={(formData) => {
              startSavingTransition(() => {
                void handleSubmit(formData);
              });
            }}
            className="space-y-6"
          >
            {loadError ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 size-4" />
                <span>{loadError}</span>
              </div>
            ) : null}

            {messageState?.message ? (
              <div
                className={messageState.success
                  ? "flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
                  : "flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                }
              >
                {messageState.success ? (
                  <CheckCircle2 className="mt-0.5 size-4" />
                ) : (
                  <AlertCircle className="mt-0.5 size-4" />
                )}
                <span>{messageState.message}</span>
              </div>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="deadlineDate">마감일</Label>
                <Input
                  id="deadlineDate"
                  name="deadlineDate"
                  type="date"
                  value={formValues.deadlineDate}
                  onChange={(event) => handleChange("deadlineDate", event.target.value)}
                  className="h-10"
                  disabled={isLoading}
                />
                {messageState?.fieldErrors?.deadlineDate ? (
                  <p className="text-xs text-red-600">{messageState.fieldErrors.deadlineDate}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="posterImageUrl">포스터 URL</Label>
                <Input
                  id="posterImageUrl"
                  name="posterImageUrl"
                  value={formValues.posterImageUrl}
                  onChange={(event) => handleChange("posterImageUrl", event.target.value)}
                  placeholder="https://example.com/poster.png"
                  className="h-10"
                  disabled={isLoading}
                />
                <p className="text-xs text-slate-500">추후 파일 업로드로 교체될 예정입니다. 지금은 URL로 입력하세요.</p>
                {messageState?.fieldErrors?.posterImageUrl ? (
                  <p className="text-xs text-red-600">{messageState.fieldErrors.posterImageUrl}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="nextRecruitmentYear">모집연도</Label>
                <Input
                  id="nextRecruitmentYear"
                  name="nextRecruitmentYear"
                  type="number"
                  min={2000}
                  step={1}
                  value={formValues.nextRecruitmentYear}
                  onChange={(event) => handleChange("nextRecruitmentYear", event.target.value)}
                  className="h-10"
                  disabled={isLoading}
                />
                {messageState?.fieldErrors?.nextRecruitmentYear ? (
                  <p className="text-xs text-red-600">{messageState.fieldErrors.nextRecruitmentYear}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="nextRecruitmentMonth">모집월</Label>
                <Input
                  id="nextRecruitmentMonth"
                  name="nextRecruitmentMonth"
                  type="number"
                  min={1}
                  max={12}
                  step={1}
                  value={formValues.nextRecruitmentMonth}
                  onChange={(event) => handleChange("nextRecruitmentMonth", event.target.value)}
                  className="h-10"
                  disabled={isLoading}
                />
                {messageState?.fieldErrors?.nextRecruitmentMonth ? (
                  <p className="text-xs text-red-600">{messageState.fieldErrors.nextRecruitmentMonth}</p>
                ) : null}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="qualificationText">자격요건 텍스트</Label>
                <Textarea
                  id="qualificationText"
                  name="qualificationText"
                  value={formValues.qualificationText}
                  onChange={(event) => handleChange("qualificationText", event.target.value)}
                  placeholder="지원 자격을 입력하세요"
                  className="min-h-32"
                  disabled={isLoading}
                />
                {messageState?.fieldErrors?.qualificationText ? (
                  <p className="text-xs text-red-600">{messageState.fieldErrors.qualificationText}</p>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-end border-t border-slate-200 pt-4">
              <Button type="submit" disabled={isLoading || isSaving} className="bg-slate-900 text-white hover:bg-slate-700">
                {isSaving ? "저장 중..." : "저장"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
