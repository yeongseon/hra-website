"use client";

import Image from "next/image";
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

type PosterInputMode = "url" | "file";

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
  const [posterInputMode, setPosterInputMode] = useState<PosterInputMode>("url");
  const [currentPosterImageUrl, setCurrentPosterImageUrl] = useState<string>("");
  const [selectedPosterFileName, setSelectedPosterFileName] = useState<string>("");
  const [removePoster, setRemovePoster] = useState(false);
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
            setCurrentPosterImageUrl("");
            setPosterInputMode("url");
            setSelectedPosterFileName("");
            setRemovePoster(false);
            return;
          }

          const posterImageUrl = settings.posterImageUrl ?? "";

          setFormValues({
            posterImageUrl,
            deadlineDate: formatDateForInput(settings.deadlineDate),
            nextRecruitmentYear: settings.nextRecruitmentYear?.toString() ?? "",
            nextRecruitmentMonth: settings.nextRecruitmentMonth?.toString() ?? "",
            qualificationText: settings.qualificationText ?? "",
          });
          setCurrentPosterImageUrl(posterImageUrl);
          setPosterInputMode("url");
          setSelectedPosterFileName("");
          setRemovePoster(false);
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

    if (result.success) {
      const settings = await getRecruitmentSettings();

      const posterImageUrl = settings?.posterImageUrl ?? "";

      setFormValues((current) => ({
        ...current,
        posterImageUrl,
      }));
      setCurrentPosterImageUrl(posterImageUrl);
      setSelectedPosterFileName("");
      setRemovePoster(false);
    }
  };

  const posterPreviewUrl = removePoster
    ? ""
    : posterInputMode === "url"
      ? formValues.posterImageUrl || currentPosterImageUrl
      : currentPosterImageUrl;

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 md:py-16">
      <Card className="border border-[#D9D9D9] bg-white py-0 text-[#1a1a1a] shadow-[var(--shadow-soft)]">
        <CardHeader className="space-y-2 border-b border-[#D9D9D9] py-6">
          <CardTitle className="text-2xl font-semibold text-[#1a1a1a]">모집 설정 관리</CardTitle>
          <p className="text-sm text-[#666666]">모집 포스터와 D-day 기준 정보를 한 곳에서 관리하세요.</p>
        </CardHeader>
        <CardContent className="py-6">
          <form
            action={(formData) => {
              startSavingTransition(() => {
                void handleSubmit(formData);
              });
            }}
            encType="multipart/form-data"
            className="space-y-6"
          >
            <input type="hidden" name="posterInputMode" value={posterInputMode} />
            <input type="hidden" name="removePoster" value={removePoster ? "true" : "false"} />

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

              <div className="space-y-4 md:col-span-2">
                <div className="space-y-2">
                  <Label>포스터 등록 방식</Label>
                  <div className="flex flex-col gap-3 rounded-xl border border-[#D9D9D9] p-4 md:flex-row md:items-center">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-[#1a1a1a]">
                      <input
                        type="radio"
                        name="posterInputModeSelector"
                        value="url"
                        checked={posterInputMode === "url"}
                        onChange={() => {
                          setPosterInputMode("url");
                          setSelectedPosterFileName("");
                        }}
                        disabled={isLoading || isSaving}
                        className="size-4 border-[#D9D9D9] text-[#2563EB]"
                      />
                      <span>URL 직접 입력</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-[#1a1a1a]">
                      <input
                        type="radio"
                        name="posterInputModeSelector"
                        value="file"
                        checked={posterInputMode === "file"}
                        onChange={() => setPosterInputMode("file")}
                        disabled={isLoading || isSaving}
                        className="size-4 border-[#D9D9D9] text-[#2563EB]"
                      />
                      <span>이미지 업로드</span>
                    </label>
                  </div>
                </div>

                {posterInputMode === "url" ? (
                  <div className="space-y-2">
                    <Label htmlFor="posterImageUrl">포스터 URL</Label>
                    <Input
                      id="posterImageUrl"
                      name="posterImageUrl"
                      value={formValues.posterImageUrl}
                      onChange={(event) => {
                        handleChange("posterImageUrl", event.target.value);
                        setRemovePoster(false);
                      }}
                      placeholder="https://example.com/poster.png"
                      className="h-10 border-[#D9D9D9] text-[#1a1a1a]"
                      disabled={isLoading || isSaving}
                    />
                    <p className="text-xs text-[#666666]">외부 이미지 주소를 바로 등록할 수 있습니다.</p>
                    {messageState?.fieldErrors?.posterImageUrl ? (
                      <p className="text-xs text-red-600">{messageState.fieldErrors.posterImageUrl}</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="posterFile">포스터 이미지 업로드</Label>
                    <Input
                      id="posterFile"
                      name="posterFile"
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const selectedFile = event.target.files?.[0];
                        setSelectedPosterFileName(selectedFile?.name ?? "");
                        if (selectedFile) {
                          setRemovePoster(false);
                        }
                      }}
                      className="h-10 border-[#D9D9D9] text-[#1a1a1a] file:mr-4 file:border-0 file:bg-[#2563EB] file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
                      disabled={isLoading || isSaving}
                    />
                    <p className="text-xs text-[#666666]">이미지 파일은 10MB 이하만 업로드할 수 있습니다.</p>
                    {selectedPosterFileName ? (
                      <p className="text-xs text-[#1a1a1a]">선택한 파일: {selectedPosterFileName}</p>
                    ) : null}
                    {messageState?.fieldErrors?.posterFile ? (
                      <p className="text-xs text-red-600">{messageState.fieldErrors.posterFile}</p>
                    ) : null}
                  </div>
                )}

                {posterPreviewUrl ? (
                  <div className="space-y-3 rounded-xl border border-[#D9D9D9] p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-[#1a1a1a]">현재 등록된 포스터</p>
                      <p className="text-xs text-[#666666]">공개 모집 페이지에 노출되는 이미지입니다.</p>
                    </div>
                    <Image
                      src={posterPreviewUrl}
                      alt="현재 등록된 모집 포스터 미리보기"
                      width={400}
                      height={560}
                      unoptimized
                      className="rounded-lg border border-[#D9D9D9] object-contain"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setRemovePoster(true);
                        setCurrentPosterImageUrl("");
                        setSelectedPosterFileName("");
                        handleChange("posterImageUrl", "");
                      }}
                      className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
                      disabled={isLoading || isSaving}
                    >
                      포스터 삭제
                    </Button>
                  </div>
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
                  className="h-10 border-[#D9D9D9] text-[#1a1a1a]"
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
                  className="h-10 border-[#D9D9D9] text-[#1a1a1a]"
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
                  className="min-h-32 border-[#D9D9D9] text-[#1a1a1a]"
                  disabled={isLoading}
                />
                {messageState?.fieldErrors?.qualificationText ? (
                  <p className="text-xs text-red-600">{messageState.fieldErrors.qualificationText}</p>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-end border-t border-[#D9D9D9] pt-4">
              <Button type="submit" disabled={isLoading || isSaving} className="bg-[#1a1a1a] text-white hover:bg-[#333333]">
                {isSaving ? "저장 중..." : "저장"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
