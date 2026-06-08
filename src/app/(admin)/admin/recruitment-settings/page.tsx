/**
 * 관리자 모집 설정 페이지
 *
 * 역할: 현재 모집 정보, 모집 포스터, 세부 안내를 각각 독립적으로 저장할 수 있는 페이지.
 *       섹션마다 별도의 저장 버튼과 메시지를 가져 불필요하게 전체를 저장하지 않아도 된다.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import {
  getCohorts,
  getRecruitmentSettings,
  updateRecruitmentInfo,
  updateRecruitmentPoster,
  updateRecruitmentDetails,
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
  activeCohortId: string;
  googleFormUrl: string;
  recruitmentStartDate: string;
  deadlineDate: string;
  detailsMarkdown: string;
  posterLayout: "right" | "left" | "none";
};

type CohortOption = { id: string; name: string };

const emptyFormValues: FormValues = {
  activeCohortId: "",
  googleFormUrl: "",
  recruitmentStartDate: "",
  deadlineDate: "",
  detailsMarkdown: "",
  posterLayout: "right",
};

// 시작일·종료일 기준으로 모집 상태를 자동 계산 (YYYY-MM-DD 문자열 비교)
function computeRecruitmentStatus(startDate: string, endDate: string): "UPCOMING" | "OPEN" | "CLOSED" {
  const now = new Date();
  const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  if (endDate && todayStr > endDate) return "CLOSED";
  if (startDate && todayStr >= startDate) return "OPEN";
  return "UPCOMING";
}

const statusConfig = {
  UPCOMING: { label: "예정", className: "bg-blue-50 text-blue-700 border-blue-300" },
  OPEN:     { label: "모집중", className: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  CLOSED:   { label: "마감", className: "bg-gray-100 text-gray-600 border-gray-300" },
} as const;

function formatDateForInput(date: Date | null) {
  if (!date) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// 섹션 하단에 공통으로 사용하는 저장 결과 메시지 컴포넌트
function SectionMessage({ state }: { state: RecruitmentSettingsActionState | null }) {
  if (!state?.message) return null;
  return (
    <div
      className={
        state.success
          ? "flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          : "flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      }
    >
      {state.success ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      ) : (
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
      )}
      <span>{state.message}</span>
    </div>
  );
}

export default function AdminRecruitmentSettingsPage() {
  const [formValues, setFormValues] = useState<FormValues>(emptyFormValues);
  const [cohortOptions, setCohortOptions] = useState<CohortOption[]>([]);
  const [currentPosterImageUrl, setCurrentPosterImageUrl] = useState<string>("");
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [removePoster, setRemovePoster] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 섹션별 독립 저장 상태 — 다른 섹션 저장 중에도 나머지 섹션은 자유롭게 수정 가능
  const [infoMessage, setInfoMessage] = useState<RecruitmentSettingsActionState | null>(null);
  const [posterMessage, setPosterMessage] = useState<RecruitmentSettingsActionState | null>(null);
  const [detailsMessage, setDetailsMessage] = useState<RecruitmentSettingsActionState | null>(null);
  const [isLoading, startLoadingTransition] = useTransition();
  const [isSavingInfo, startSavingInfoTransition] = useTransition();
  const [isSavingPoster, startSavingPosterTransition] = useTransition();
  const [isSavingDetails, startSavingDetailsTransition] = useTransition();

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    startLoadingTransition(() => {
      // 코호트 목록을 먼저 로드한 뒤 설정을 불러와야 기수 선택 드롭다운이 올바른 이름을 표시한다.
      void getCohorts()
        .then((cohorts) => {
          setCohortOptions(cohorts);
          return getRecruitmentSettings();
        })
        .then((settings) => {
          if (!settings) {
            setFormValues(emptyFormValues);
            setCurrentPosterImageUrl("");
            setLocalPreviewUrl("");
            setRemovePoster(false);
            return;
          }
          setFormValues({
            activeCohortId: settings.activeCohortId ?? "",
            googleFormUrl: settings.googleFormUrl ?? "",
            recruitmentStartDate: formatDateForInput(settings.recruitmentStartDate),
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

  const handleChange = (field: keyof FormValues, value: string | null) => {
    setFormValues((current) => ({ ...current, [field]: value ?? "" }));
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

  // ── 섹션 1: 현재 모집 정보 저장 ─────────────────────────────────────────────
  const handleSubmitInfo = async () => {
    setInfoMessage(null);
    const fd = new FormData();
    fd.set("activeCohortId", formValues.activeCohortId);
    fd.set("googleFormUrl", formValues.googleFormUrl);
    fd.set("recruitmentStartDate", formValues.recruitmentStartDate);
    fd.set("deadlineDate", formValues.deadlineDate);
    const result = await updateRecruitmentInfo(fd);
    setInfoMessage(result);
  };

  // ── 섹션 2: 모집 포스터 저장 ────────────────────────────────────────────────
  const handleSubmitPoster = async () => {
    setPosterMessage(null);
    const fd = new FormData();
    fd.set("posterInputMode", "file");
    fd.set("removePoster", removePoster ? "true" : "false");
    fd.set("posterLayout", formValues.posterLayout);
    if (fileInputRef.current?.files?.[0]) {
      fd.set("posterFile", fileInputRef.current.files[0]);
    }
    const result = await updateRecruitmentPoster(fd);
    setPosterMessage(result);
    if (result.success) {
      const settings = await getRecruitmentSettings();
      setCurrentPosterImageUrl(settings?.posterImageUrl ?? "");
      setLocalPreviewUrl("");
      setRemovePoster(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── 섹션 3: 모집 세부 안내 저장 ─────────────────────────────────────────────
  const handleSubmitDetails = async () => {
    setDetailsMessage(null);
    const fd = new FormData();
    fd.set("detailsMarkdown", formValues.detailsMarkdown);
    const result = await updateRecruitmentDetails(fd);
    setDetailsMessage(result);
  };

  const previewUrl = localPreviewUrl || (!removePoster ? currentPosterImageUrl : "");

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 md:py-16 space-y-6">
      {/* 페이지 헤더 */}
      <div>
        <h1 className="text-xl font-semibold text-[#1a1a1a]">모집 설정 관리</h1>
        <p className="text-sm text-[#666666] mt-1">각 섹션을 독립적으로 저장할 수 있습니다.</p>
      </div>

      {loadError ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      ) : null}

      {/* ── 섹션 1: 현재 모집 ─────────────────────────────────────────────── */}
      <Card className="border border-[#D9D9D9] bg-white py-0 text-[#1a1a1a] shadow-[var(--shadow-soft)]">
        <CardHeader className="border-b border-[#D9D9D9] py-5">
          <CardTitle className="text-base font-semibold text-[#1a1a1a]">현재 모집</CardTitle>
          <p className="text-sm text-[#666666]">공개 모집안내 페이지에 표시할 기수와 모집 정보를 설정하세요.</p>
        </CardHeader>
        <CardContent className="py-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* 모집 기수 선택 — SelectTrigger에 이름을 직접 표시해 비동기 로딩 후에도 UUID가 노출되지 않게 함 */}
            <div className="space-y-2">
              <Label htmlFor="activeCohortId">모집 기수</Label>
              <Select
                value={formValues.activeCohortId || "none"}
                onValueChange={(v) => handleChange("activeCohortId", !v || v === "none" ? "" : v)}
                disabled={isLoading || isSavingInfo}
              >
                <SelectTrigger id="activeCohortId" className="h-10 w-full">
                  <span className="flex flex-1 items-center text-left text-sm">
                    {formValues.activeCohortId
                      ? (cohortOptions.find((c) => c.id === formValues.activeCohortId)?.name ?? "기수를 선택하세요")
                      : <span className="text-muted-foreground">없음 (모집 없음)</span>}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">없음 (모집 없음)</SelectItem>
                  {cohortOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 모집 상태 — 시작일·종료일 기준 자동 계산 */}
            {(() => {
              const status = computeRecruitmentStatus(formValues.recruitmentStartDate, formValues.deadlineDate);
              const info = statusConfig[status];
              return (
                <div className="space-y-2">
                  <Label>모집 상태</Label>
                  <div className="flex h-10 items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${info.className}`}>
                      {info.label}
                    </span>
                    <span className="text-xs text-[#666666]">시작일·종료일 기준 자동 계산</span>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-2">
              <Label htmlFor="recruitmentStartDate">모집 시작일</Label>
              <Input
                id="recruitmentStartDate"
                type="date"
                value={formValues.recruitmentStartDate}
                onChange={(e) => handleChange("recruitmentStartDate", e.target.value)}
                className="h-10"
                disabled={isLoading || isSavingInfo}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="deadlineDate">모집 종료일</Label>
              <Input
                id="deadlineDate"
                type="date"
                value={formValues.deadlineDate}
                onChange={(e) => handleChange("deadlineDate", e.target.value)}
                className="h-10"
                disabled={isLoading || isSavingInfo}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="googleFormUrl">지원 구글폼 URL</Label>
              <Input
                id="googleFormUrl"
                type="url"
                placeholder="https://forms.google.com/..."
                value={formValues.googleFormUrl}
                onChange={(e) => handleChange("googleFormUrl", e.target.value)}
                className="h-10"
                disabled={isLoading || isSavingInfo}
              />
              <p className="text-xs text-[#666666]">모집안내 페이지의 &quot;지원하기&quot; 버튼에 연결됩니다.</p>
            </div>
          </div>

          {/* 섹션 1 저장 푸터 */}
          <div className="flex items-center justify-between gap-4 border-t border-[#D9D9D9] pt-4">
            <div className="flex-1 min-w-0">
              <SectionMessage state={infoMessage} />
            </div>
            <Button
              type="button"
              onClick={() => startSavingInfoTransition(() => { void handleSubmitInfo(); })}
              disabled={isLoading || isSavingInfo}
              className="shrink-0 bg-[#1a1a1a] text-white hover:bg-[#333333]"
            >
              {isSavingInfo ? "저장 중..." : "저장"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── 섹션 2: 모집 포스터 ───────────────────────────────────────────── */}
      <Card className="border border-[#D9D9D9] bg-white py-0 text-[#1a1a1a] shadow-[var(--shadow-soft)]">
        <CardHeader className="border-b border-[#D9D9D9] py-5">
          <CardTitle className="text-base font-semibold text-[#1a1a1a]">모집 포스터</CardTitle>
          <p className="text-sm text-[#666666]">이미지 파일을 드래그하거나 클릭해서 업로드하세요. (10MB 이하)</p>
        </CardHeader>
        <CardContent className="py-6 space-y-4">
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
            disabled={isLoading || isSavingPoster}
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
                  disabled={isLoading || isSavingPoster}
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

          {/* 섹션 2 저장 푸터 */}
          <div className="flex items-center justify-between gap-4 border-t border-[#D9D9D9] pt-4">
            <div className="flex-1 min-w-0">
              <SectionMessage state={posterMessage} />
            </div>
            <Button
              type="button"
              onClick={() => startSavingPosterTransition(() => { void handleSubmitPoster(); })}
              disabled={isLoading || isSavingPoster}
              className="shrink-0 bg-[#1a1a1a] text-white hover:bg-[#333333]"
            >
              {isSavingPoster ? "저장 중..." : "저장"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── 섹션 3: 모집 세부 안내 ───────────────────────────────────────── */}
      <Card className="border border-[#D9D9D9] bg-white py-0 text-[#1a1a1a] shadow-[var(--shadow-soft)]">
        <CardHeader className="border-b border-[#D9D9D9] py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base font-semibold text-[#1a1a1a]">모집 세부 안내</CardTitle>
              <p className="text-sm text-[#666666] mt-1">
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
        </CardHeader>
        <CardContent className="py-6 space-y-4">
          <RichTextEditor
            id="detailsMarkdown"
            name="detailsMarkdown"
            value={formValues.detailsMarkdown}
            onChange={(html) => handleChange("detailsMarkdown", html)}
            placeholder="기본 템플릿 버튼을 눌러 시작하거나, 내용을 자유롭게 작성하세요."
          />

          {/* 섹션 3 저장 푸터 */}
          <div className="flex items-center justify-between gap-4 border-t border-[#D9D9D9] pt-4">
            <div className="flex-1 min-w-0">
              <SectionMessage state={detailsMessage} />
            </div>
            <Button
              type="button"
              onClick={() => startSavingDetailsTransition(() => { void handleSubmitDetails(); })}
              disabled={isLoading || isSavingDetails}
              className="shrink-0 bg-[#1a1a1a] text-white hover:bg-[#333333]"
            >
              {isSavingDetails ? "저장 중..." : "저장"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
