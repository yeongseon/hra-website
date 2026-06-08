/**
 * 제출 내역 CSV 내보내기 버튼 컴포넌트
 */
"use client";

import { useState, useTransition } from "react";
import { Download, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { exportSubmissionsToCsv } from "@/features/applications/actions/submissions";

type CsvExportButtonProps = {
  formId: string;
};

export function CsvExportButton({ formId }: CsvExportButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleExport = () => {
    startTransition(async () => {
      const result = await exportSubmissionsToCsv(formId);
      
      if (result.success && result.data && result.filename) {
        // Blob 생성 및 다운로드 링크 트리거
        const blob = new Blob([result.data], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", result.filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        toast.success("데이터를 추출했습니다.");
      } else {
        toast.error(result.message || "데이터 추출에 실패했습니다.");
      }
    });
  };

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleExport} 
      disabled={isPending}
      className="flex items-center gap-2 border-slate-200 hover:border-slate-300 bg-white"
    >
      {isPending ? (
        <span className="size-4 animate-spin border-2 border-slate-300 border-t-slate-600 rounded-full" />
      ) : (
        <FileDown className="size-4 text-emerald-600" />
      )}
      <span className="font-medium text-slate-700">엑셀(CSV) 추출</span>
    </Button>
  );
}
