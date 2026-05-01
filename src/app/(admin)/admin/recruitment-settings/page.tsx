/**
 * 관리자 모집 설정 페이지
 *
 * 역할: 모집 포스터(드래그앤드롭), 세부 안내(마크다운 에디터 + 미리보기),
 *       D-day 마감일, 지원 자격 안내 등 모집 관련 전반 설정을 관리한다.
 * 사용 위치: /admin/recruitment-settings (관리자 전용)
 */
"use client";

import Image from "next/image";
import ReactMarkdown from "react-markdown";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Eye, ImageIcon, Pencil, Upload, X } from "lucide-react";
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

type FormValues = {
  deadlineDate: string;
  nextRecruitmentYear: string;
  nextRecruitmentMonth: string;
  qualificationText: string;
  detailsMarkdown: string;
};

const emptyFormValues: FormValues = {
  deadlineDate: "",
  nextRecruitmentYear: "",
  nextRecruitmentMonth: "",
  qualificationText: "",
  detailsMarkdown: "",
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
  const [markdownTab, setMarkdownTab] = useState<"edit" | "preview">("edit");

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
            nextRecruitmentYear: settings.nextRecruitmentYear?.toString() ?? "",
            nextRecruitmentMonth: settings.nextRecruitmentMonth?.toString() ?? "",
            qualificationText: settings.qualificationText ?? "",
            detailsMarkdown: settings.detailsMarkdown ?? "",
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
          <p className="text-sm text-[#666666]">모집 포스터, 세부 안내 텍스트, D-day 기준 정보를 한 곳에서 관리하세요.</p>
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
            {/* 에러/성공 메시지 */}
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
            </section>

            {/* 모집 세부 안내 — 마크다운 에디터 */}
            <section className="space-y-3">
              <div>
                <h3 className="text-base font-semibold text-[#1a1a1a]">모집 세부 안내</h3>
                <p className="text-sm text-[#666666]">
                  포스터 옆 좌측 영역에 표시됩니다. 마크다운 문법으로 자유롭게 작성하세요.
                </p>
              </div>

              {/* 편집 / 미리보기 탭 */}
              <div className="flex gap-1 rounded-lg border border-[#D9D9D9] bg-gray-50 p-1 w-fit">
                <button
                  type="button"
                  onClick={() => setMarkdownTab("edit")}
                  className={[
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    markdownTab === "edit"
                      ? "bg-white text-[#1a1a1a] shadow-sm"
                      : "text-[#666666] hover:text-[#1a1a1a]",
                  ].join(" ")}
                >
                  <Pencil className="size-3" />
                  편집
                </button>
                <button
                  type="button"
                  onClick={() => setMarkdownTab("preview")}
                  className={[
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    markdownTab === "preview"
                      ? "bg-white text-[#1a1a1a] shadow-sm"
                      : "text-[#666666] hover:text-[#1a1a1a]",
                  ].join(" ")}
                >
                  <Eye className="size-3" />
                  미리보기
                </button>
              </div>

              {markdownTab === "edit" ? (
                <Textarea
                  id="detailsMarkdown"
                  name="detailsMarkdown"
                  value={formValues.detailsMarkdown}
                  onChange={(e) => handleChange("detailsMarkdown", e.target.value)}
                  placeholder={"## 모집 기간\n2026년 4월 14일 ~ 5월 19일\n\n## 활동 기간\n2026년 9월 ~ 2027년 6월\n\n## 지원 대상\n4년제 대학교 재학생 또는 졸업생\n\n## 선발 일정\n- 서류 접수: 4월 14일 ~ 5월 19일\n- 서류 발표: 5월 23일\n- 면접: 6월 7일 ~ 6월 14일\n- 최종 발표: 6월 20일"}
                  className="min-h-64 font-mono text-sm border-[#D9D9D9] text-[#1a1a1a] resize-y"
                  disabled={isLoading}
                />
              ) : (
                <div className="min-h-64 rounded-md border border-[#D9D9D9] bg-white p-4">
                  {formValues.detailsMarkdown.trim() ? (
                    <div className="markdown-preview text-sm text-[#1a1a1a] prose prose-sm max-w-none">
                      <ReactMarkdown
                        components={{
                          h1: (props) => <h1 className="text-lg font-bold mb-3 text-[#1a1a1a]" {...props} />,
                          h2: (props) => <h2 className="text-base font-semibold mb-2 mt-4 text-[#2563EB]" {...props} />,
                          h3: (props) => <h3 className="text-sm font-semibold mb-1 mt-3 text-[#1a1a1a]" {...props} />,
                          p: (props) => <p className="mb-2 leading-relaxed text-[#1a1a1a]" {...props} />,
                          ul: (props) => <ul className="list-disc ml-5 mb-3 space-y-1" {...props} />,
                          ol: (props) => <ol className="list-decimal ml-5 mb-3 space-y-1" {...props} />,
                          li: (props) => <li className="text-sm text-[#1a1a1a]" {...props} />,
                          strong: (props) => <strong className="font-semibold text-[#1a1a1a]" {...props} />,
                          hr: (props) => <hr className="border-[#D9D9D9] my-3" {...props} />,
                        }}
                      >
                        {formValues.detailsMarkdown}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm text-[#666666]">작성된 내용이 없습니다. 편집 탭에서 내용을 입력하세요.</p>
                  )}
                </div>
              )}
              {messageState?.fieldErrors?.detailsMarkdown ? (
                <p className="text-xs text-red-600">{messageState.fieldErrors.detailsMarkdown}</p>
              ) : null}
            </section>

            {/* D-day / 자격요건 섹션 */}
            <section className="space-y-4">
              <h3 className="text-base font-semibold text-[#1a1a1a]">마감일 및 자격요건</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="deadlineDate">마감일</Label>
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

                <div className="space-y-2">
                  <Label htmlFor="nextRecruitmentYear">모집연도</Label>
                  <Input
                    id="nextRecruitmentYear"
                    name="nextRecruitmentYear"
                    type="number"
                    min={2000}
                    step={1}
                    value={formValues.nextRecruitmentYear}
                    onChange={(e) => handleChange("nextRecruitmentYear", e.target.value)}
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
                    onChange={(e) => handleChange("nextRecruitmentMonth", e.target.value)}
                    className="h-10 border-[#D9D9D9] text-[#1a1a1a]"
                    disabled={isLoading}
                  />
                  {messageState?.fieldErrors?.nextRecruitmentMonth ? (
                    <p className="text-xs text-red-600">{messageState.fieldErrors.nextRecruitmentMonth}</p>
                  ) : null}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="qualificationText">지원 자격 안내 (줄바꿈으로 항목 구분)</Label>
                  <Textarea
                    id="qualificationText"
                    name="qualificationText"
                    value={formValues.qualificationText}
                    onChange={(e) => handleChange("qualificationText", e.target.value)}
                    placeholder={"예:\n4년제 대학교 재학생 또는 졸업생\n학기 중 매주 토요일 수업 참여 가능한 자\n고전 읽기와 토론에 관심이 있는 자"}
                    className="min-h-28 border-[#D9D9D9] text-[#1a1a1a]"
                    disabled={isLoading}
                  />
                  {messageState?.fieldErrors?.qualificationText ? (
                    <p className="text-xs text-red-600">{messageState.fieldErrors.qualificationText}</p>
                  ) : null}
                </div>
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
