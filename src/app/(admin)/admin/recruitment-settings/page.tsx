/**
 * 관리자 모집 설정 페이지
 *
 * 역할: 모집 포스터(드래그앤드롭), 세부 안내(마크다운 에디터 + 미리보기),
 *       D-day 마감일 등 모집 관련 전반 설정을 관리한다.
 * 사용 위치: /admin/recruitment-settings (관리자 전용)
 */
"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, FileText, ImageIcon, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import {
  getRecruitmentSettings,
  updateRecruitmentSettings,
  type RecruitmentSettingsActionState,
} from "@/features/recruitment-settings/actions";

// 모집 안내 기본 템플릿 (마크다운). "기본 템플릿 적용" 버튼에서 사용합니다.
const DEFAULT_MARKDOWN_TEMPLATE = `## 지원 자격

- 4년제 대학교 재학생 또는 졸업생
- 학기 중 매주 토요일 수업 참여 가능한 자
- 고전 읽기와 토론에 관심이 있는 자

## 모집 일정

- 서류 접수: 월 일 ~ 월 일
- 서류 발표: 월 일
- 면접: 월 일 ~ 월 일
- 최종 발표: 월 일

## 활동 기간

년 월 ~ 년 월 (매주 토요일)

## 유의사항

- 지원서는 홈페이지 온라인 지원서로만 접수합니다.
- 입학 후 무단 불참 시 수료가 제한될 수 있습니다.
`;

type FormValues = {
  deadlineDate: string;
  detailsMarkdown: string;
  posterLayout: "right" | "left" | "none";
};

const emptyFormValues: FormValues = {
  deadlineDate: "",
  detailsMarkdown: "",
  posterLayout: "right",
};

function formatDateForInput(date: Date | null) {
  if (!date) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function AdminRecruitmentSettingsPage() {
  const [formValues, setFormValues] = useState<FormValues>(emptyFormValues);
  const [currentPosterImageUrl, setCurrentPosterImageUrl] = useState<string>("");
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [removePoster, setRemovePoster] = useState(false);
  const [messageState, setMessageState] = useState<RecruitmentSettingsActionState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, startLoadingTransition] = useTransition();
  const [isSaving, startSavingTransition] = useTransition();

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    startLoadingTransition(() => {
      void getRecruitmentSettings()
        .then((settings) => {
          if (!settings) {
            setFormValues(emptyFormValues);
            setCurrentPosterImageUrl("");
            setLocalPreviewUrl("");
            setRemovePoster(false);
            return;
          }
          setFormValues({
            deadlineDate: formatDateForInput(settings.deadlineDate),
            detailsMarkdown: settings.detailsMarkdown ?? "",
            posterLayout: (settings.posterLayout as "right" | "left" | "none") ?? "right",
          });
          setCurrentPosterImageUrl(settings.posterImageUrl ?? "");
          setLocalPreviewUrl("");
          setRemovePoster(false);
        })
        .catch(() => {
          setLoadError("현재 모집 설정을 불러오지 못했습니다.");
        });
    });
  }, []);

  const handleChange = (field: keyof FormValues, value: string) => {
    setFormValues((current) => ({ ...current, [field]: value }));
  };

  const handleFileSelect = useCallback((file: File) => {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(URL.createObjectURL(file));
    setRemovePoster(false);
  }, [localPreviewUrl]);

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    if (fileInputRef.current) fileInputRef.current.files = dt.files;
    handleFileSelect(file);
  };

  const handleRemovePoster = () => {
    setRemovePoster(true);
    setCurrentPosterImageUrl("");
    setLocalPreviewUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleLoadTemplate = () => {
    if (formValues.detailsMarkdown.trim() && !confirm("현재 내용을 기본 템플릿으로 덮어씌우시겠습니까?")) return;
    handleChange("detailsMarkdown", DEFAULT_MARKDOWN_TEMPLATE);
  };

  const handleSubmit = async (formData: FormData) => {
    setMessageState(null);
    setLoadError(null);
    formData.set("posterInputMode", "file");
    formData.set("removePoster", removePoster ? "true" : "false");

    const result = await updateRecruitmentSettings(formData);
    setMessageState(result);

    if (result.success) {
      const settings = await getRecruitmentSettings();
      setCurrentPosterImageUrl(settings?.posterImageUrl ?? "");
      setLocalPreviewUrl("");
      setRemovePoster(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const previewUrl = localPreviewUrl || (!removePoster ? currentPosterImageUrl : "");

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 md:py-16">
      <Card className="border border-[#D9D9D9] bg-white py-0 text-[#1a1a1a] shadow-[var(--shadow-soft)]">
        <CardHeader className="space-y-2 border-b border-[#D9D9D9] py-6">
          <CardTitle className="text-2xl font-semibold text-[#1a1a1a]">모집 설정 관리</CardTitle>
          <p className="text-sm text-[#666666]">모집 포스터, 세부 안내 텍스트, 마감일을 한 곳에서 관리하세요.</p>
        </CardHeader>
        <CardContent className="py-6">
          <form
            action={(formData) => {
              startSavingTransition(() => {
                void handleSubmit(formData);
              });
            }}
            encType="multipart/form-data"
            className="space-y-8"
          >
            {loadError ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
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
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                ) : (
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                )}
                <span>{messageState.message}</span>
              </div>
            ) : null}

            {/* 포스터 업로드 섹션 */}
            <section className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-[#1a1a1a]">모집 포스터</h3>
                <p className="text-sm text-[#666666]">이미지 파일을 드래그하거나 클릭해서 업로드하세요. (10MB 이하)</p>
              </div>

              <label
                htmlFor="posterFile"
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={[
                  "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors",
                  isDragging
                    ? "border-[#2563EB] bg-blue-50"
                    : "border-[#D9D9D9] bg-gray-50 hover:border-[#2563EB] hover:bg-blue-50",
                ].join(" ")}
              >
                <Upload className="size-8 text-[#666666]" />
                <div className="text-center">
                  <p className="text-sm font-medium text-[#1a1a1a]">이미지를 드래그하거나 클릭해서 선택</p>
                  <p className="text-xs text-[#666666]">JPG, PNG, WEBP, GIF 지원 · 최대 10MB</p>
                </div>
              </label>

              <input
                ref={fileInputRef}
                id="posterFile"
                name="posterFile"
                type="file"
                accept="image/*"
                onChange={handleFileInputChange}
                className="hidden"
                disabled={isLoading || isSaving}
              />

              {previewUrl ? (
                <div className="space-y-3 rounded-xl border border-[#D9D9D9] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-[#1a1a1a]">
                        {localPreviewUrl ? "새로 선택한 포스터" : "현재 등록된 포스터"}
                      </p>
                      <p className="text-xs text-[#666666]">공개 모집 페이지에 노출되는 이미지입니다.</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRemovePoster}
                      className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
                      disabled={isLoading || isSaving}
                    >
                      <X className="size-3.5 mr-1" />
                      삭제
                    </Button>
                  </div>
                  <Image
                    src={previewUrl}
                    alt="모집 포스터 미리보기"
                    width={400}
                    height={560}
                    unoptimized
                    className="rounded-lg border border-[#D9D9D9] object-contain max-h-96"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-[#D9D9D9] bg-gray-50 p-4">
                  <ImageIcon className="size-8 text-[#D9D9D9] shrink-0" />
                  <p className="text-sm text-[#666666]">등록된 포스터가 없습니다.</p>
                </div>
              )}

              {/* 포스터 위치 선택 */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-[#1a1a1a]">포스터 위치</p>
                <div className="flex gap-4">
                  {(["right", "left", "none"] as const).map((val) => {
                    const label = val === "right" ? "우측 (기본)" : val === "left" ? "좌측" : "표시 안 함";
                    return (
                      <label key={val} className="flex cursor-pointer items-center gap-2 text-sm text-[#1a1a1a]">
                        <input
                          type="radio"
                          name="posterLayout"
                          value={val}
                          checked={formValues.posterLayout === val}
                          onChange={() => handleChange("posterLayout", val)}
                          className="accent-[#2563EB]"
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* 모집 세부 안내 — 리치 텍스트 에디터 */}
            <section className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-[#1a1a1a]">모집 세부 안내</h3>
                  <p className="text-sm text-[#666666]">
                    지원 자격, 모집 일정, 활동 기간, 유의사항 등 모든 안내를 자유롭게 작성하세요.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLoadTemplate}
                  className="flex shrink-0 items-center gap-1.5 rounded-md border border-[#D9D9D9] bg-white px-3 py-1.5 text-xs font-medium text-[#666666] hover:border-[#2563EB] hover:text-[#2563EB] transition-colors"
                >
                  <FileText className="size-3.5" />
                  기본 템플릿
                </button>
              </div>

              <RichTextEditor
                id="detailsMarkdown"
                name="detailsMarkdown"
                value={formValues.detailsMarkdown}
                onChange={(html) => handleChange("detailsMarkdown", html)}
                placeholder="기본 템플릿 버튼을 눌러 시작하거나, 내용을 자유롭게 작성하세요."
              />

              {messageState?.fieldErrors?.detailsMarkdown ? (
                <p className="text-xs text-red-600">{messageState.fieldErrors.detailsMarkdown}</p>
              ) : null}
            </section>

            {/* 마감일 섹션 */}
            <section className="space-y-4">
              <h3 className="text-base font-semibold text-[#1a1a1a]">마감일</h3>
              <div className="max-w-xs space-y-2">
                <Label htmlFor="deadlineDate">마감일 (D-day 기준)</Label>
                <Input
                  id="deadlineDate"
                  name="deadlineDate"
                  type="date"
                  value={formValues.deadlineDate}
                  onChange={(e) => handleChange("deadlineDate", e.target.value)}
                  className="h-10"
                  disabled={isLoading}
                />
                {messageState?.fieldErrors?.deadlineDate ? (
                  <p className="text-xs text-red-600">{messageState.fieldErrors.deadlineDate}</p>
                ) : null}
              </div>
            </section>

            <div className="flex items-center justify-end border-t border-[#D9D9D9] pt-4">
              <Button
                type="submit"
                disabled={isLoading || isSaving}
                className="bg-[#1a1a1a] text-white hover:bg-[#333333]"
              >
                {isSaving ? "저장 중..." : "저장"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
