"use client";

/**
 * 수업일지 인쇄 뷰 (클라이언트 컴포넌트)
 *
 * 역할: A4 인쇄용 레이아웃을 그리고, 마운트 시 한 번 window.print()를 호출한다.
 *       useRef 가드로 React Strict Mode의 더블 마운트에서도 한 번만 실행되도록 한다.
 */

import { useEffect, useRef } from "react";
import { MarkdownViewer } from "@/components/markdown/markdown-viewer";

type Props = {
  title: string;
  fileTitle: string;
  classDate: Date;
  authorName: string | null;
  body: string;
};

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

export function PrintView({ title, fileTitle, classDate, authorName, body }: Props) {
  const printedRef = useRef(false);

  useEffect(() => {
    document.title = fileTitle;
    if (printedRef.current) return;
    printedRef.current = true;
    // 폰트/이미지 로딩이 어느 정도 마무리된 뒤 인쇄 다이얼로그 호출
    const timer = window.setTimeout(() => {
      window.print();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [fileTitle]);

  return (
    <>
      {/* A4 인쇄 전용 스타일 — 화면 폭 제한과 페이지 여백을 함께 정의한다 */}
      <style>{`
        @page {
          size: A4;
          margin: 20mm 18mm;
        }
        @media print {
          .no-print { display: none !important; }
          body { background: #ffffff !important; }
          .print-page { padding: 0 !important; max-width: none !important; }
          h1, h2, h3 { page-break-after: avoid; }
          pre, table, blockquote { page-break-inside: avoid; }
        }
      `}</style>

      <div className="print-page mx-auto max-w-4xl px-6 py-12 print:px-0 print:py-0">
        <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#D9D9D9] bg-white p-4">
          <p className="text-sm text-[#666666]">
            인쇄 다이얼로그가 자동으로 열립니다. 대상에서 <strong className="text-[#1a1a1a]">PDF로 저장</strong>을 선택하세요.
          </p>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-[#1a1a1a] px-4 py-2 text-sm font-medium text-white hover:bg-[#333333]"
          >
            다시 인쇄
          </button>
        </div>

        <header className="mb-8 border-b border-[#D9D9D9] pb-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#666666] mb-1">
            <span>{formatDate(classDate)}</span>
            <span>·</span>
            <span>{authorName}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a]">
            {title}
          </h1>
        </header>

        <MarkdownViewer body={body} />
      </div>
    </>
  );
}
