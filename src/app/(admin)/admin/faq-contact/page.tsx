"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFaqContact, updateFaqContact, type FaqContactActionState } from "@/features/faq/actions";

type FaqContactFormValues = {
  cohortName: string;
  contactName: string;
  contactPhone: string;
  contactRole: string;
};

const emptyFormValues: FaqContactFormValues = {
  cohortName: "",
  contactName: "",
  contactPhone: "",
  contactRole: "",
};

export default function AdminFaqContactPage() {
  const [formValues, setFormValues] = useState<FaqContactFormValues>(emptyFormValues);
  const [messageState, setMessageState] = useState<FaqContactActionState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, startLoadingTransition] = useTransition();
  const [isSaving, startSavingTransition] = useTransition();

  useEffect(() => {
    startLoadingTransition(() => {
      void getFaqContact()
        .then((contact) => {
          if (!contact) {
            setFormValues(emptyFormValues);
            return;
          }

          setFormValues({
            cohortName: contact.cohortName,
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
    setFormValues((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async (formData: FormData) => {
    setMessageState(null);
    setLoadError(null);

    const result = await updateFaqContact(formData);
    setMessageState(result);
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 md:py-16">
      <Card className="border border-slate-200 bg-white py-0 text-slate-900 shadow-sm">
        <CardHeader className="space-y-2 border-b border-slate-200 py-6">
          <CardTitle className="text-2xl font-semibold text-slate-900">FAQ 연락처 관리</CardTitle>
          <p className="text-sm text-slate-600">FAQ 페이지에 노출되는 담당자 연락처를 설정하세요.</p>
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
                <Label htmlFor="cohortName">기수명</Label>
                <Input
                  id="cohortName"
                  name="cohortName"
                  value={formValues.cohortName}
                  onChange={(event) => handleChange("cohortName", event.target.value)}
                  placeholder="예: 20기"
                  className="h-10"
                  disabled={isLoading}
                />
                {messageState?.fieldErrors?.cohortName ? (
                  <p className="text-xs text-red-600">{messageState.fieldErrors.cohortName}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactName">담당자명</Label>
                <Input
                  id="contactName"
                  name="contactName"
                  value={formValues.contactName}
                  onChange={(event) => handleChange("contactName", event.target.value)}
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
                  onChange={(event) => handleChange("contactPhone", event.target.value)}
                  placeholder="예: 010-0000-0000"
                  className="h-10"
                  disabled={isLoading}
                />
                {messageState?.fieldErrors?.contactPhone ? (
                  <p className="text-xs text-red-600">{messageState.fieldErrors.contactPhone}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactRole">역할</Label>
                <Input
                  id="contactRole"
                  name="contactRole"
                  value={formValues.contactRole}
                  onChange={(event) => handleChange("contactRole", event.target.value)}
                  placeholder="예: 모집위원장"
                  className="h-10"
                  disabled={isLoading}
                />
                {messageState?.fieldErrors?.contactRole ? (
                  <p className="text-xs text-red-600">{messageState.fieldErrors.contactRole}</p>
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
