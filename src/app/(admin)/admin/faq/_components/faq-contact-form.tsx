// FAQ 연락처 설정 폼 컴포넌트 (클라이언트)
// FAQ 관리 페이지 상단에 인라인으로 임베드되는 연락처 설정 섹션
// FAQ 페이지에 노출될 담당자 정보(역할, 담당자명, 연락처)를 관리합니다.

"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getFaqContact,
  updateFaqContact,
  type FaqContactActionState,
} from "@/features/faq/actions";

// 폼 필드 타입 정의 (역할·담당자명·연락처 세 항목만 노출)
type FaqContactFormValues = {
  contactName: string;
  contactPhone: string;
  contactRole: string;
};

const emptyFormValues: FaqContactFormValues = {
  contactName: "",
  contactPhone: "",
  contactRole: "",
};

/**
 * FaqContactForm — FAQ 연락처 설정 인라인 폼
 * FAQ 관리 페이지 하단에 렌더링되어 담당자 정보를 수정·저장할 수 있습니다.
 */
export function FaqContactForm() {
  const [formValues, setFormValues] = useState<FaqContactFormValues>(emptyFormValues);
  const [messageState, setMessageState] = useState<FaqContactActionState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, startLoadingTransition] = useTransition();
  const [isSaving, startSavingTransition] = useTransition();

  // 컴포넌트 마운트 시 기존 연락처 데이터 로드
  useEffect(() => {
    startLoadingTransition(() => {
      void getFaqContact()
        .then((contact) => {
          if (!contact) {
            setFormValues(emptyFormValues);
            return;
          }
          setFormValues({
            contactName: contact.contactName,
            contactPhone: contact.contactPhone,
            contactRole: contact.contactRole,
          });
        })
        .catch(() => {
          setLoadError("현재 FAQ 연락처 정보를 불러오지 못했습니다.");
        });
    });
  }, []);

  const handleChange = (field: keyof FaqContactFormValues, value: string) => {
    setFormValues((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (formData: FormData) => {
    setMessageState(null);
    setLoadError(null);
    const result = await updateFaqContact(formData);
    setMessageState(result);
  };

  return (
    <Card className="border-[#D9D9D9] bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-[#D9D9D9] py-4">
        <CardTitle className="text-base text-[#1a1a1a]">연락처 설정</CardTitle>
        <p className="text-sm text-[#666666]">FAQ 페이지에 노출되는 담당자 연락처를 설정하세요.</p>
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
          {/* 로드 에러 표시 */}
          {loadError ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 size-4" />
              <span>{loadError}</span>
            </div>
          ) : null}

          {/* 저장 결과 피드백 */}
          {messageState?.message ? (
            <div
              className={
                messageState.success
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

          {/* 3열 한 줄 입력 폼 — 역할·담당자명·연락처 */}
          <div className="grid gap-4 grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="contactRole">역할</Label>
              <Input
                id="contactRole"
                name="contactRole"
                value={formValues.contactRole}
                onChange={(e) => handleChange("contactRole", e.target.value)}
                placeholder="예: 모집위원장"
                className="h-10"
                disabled={isLoading}
              />
              {messageState?.fieldErrors?.contactRole ? (
                <p className="text-xs text-red-600">{messageState.fieldErrors.contactRole}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactName">담당자명</Label>
              <Input
                id="contactName"
                name="contactName"
                value={formValues.contactName}
                onChange={(e) => handleChange("contactName", e.target.value)}
                placeholder="담당자명을 입력하세요"
                className="h-10"
                disabled={isLoading}
              />
              {messageState?.fieldErrors?.contactName ? (
                <p className="text-xs text-red-600">{messageState.fieldErrors.contactName}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactPhone">연락처</Label>
              <Input
                id="contactPhone"
                name="contactPhone"
                value={formValues.contactPhone}
                onChange={(e) => handleChange("contactPhone", e.target.value)}
                placeholder="예: 010-0000-0000"
                className="h-10"
                disabled={isLoading}
              />
              {messageState?.fieldErrors?.contactPhone ? (
                <p className="text-xs text-red-600">{messageState.fieldErrors.contactPhone}</p>
              ) : null}
            </div>
          </div>

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
  );
}
