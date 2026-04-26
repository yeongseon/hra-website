/**
 * 회원 — 보고서 양식 인쇄(PDF 다운로드) 페이지
 *
 * 역할: 양식 본문을 A4 인쇄에 최적화된 레이아웃으로 표시하고,
 *       페이지 진입 시 자동으로 브라우저 인쇄 다이얼로그를 띄운다.
 *       사용자는 "PDF로 저장"을 선택해 파일로 내려받을 수 있다.
 *
 * 파일명 규칙(브라우저 인쇄 다이얼로그 기본 제목): document.title을
 *   "HRA보고서양식_{양식명}_v{버전}" 형태로 지정한다.
 *   사용자가 실제 PDF 파일로 저장 시 이 제목이 파일명 후보가 된다.
 */

import { notFound } from "next/navigation";
import { resolveTemplate } from "@/lib/markdown/resolve";
import { PrintView } from "./_print-view";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function MemberTemplatePrintPage({ params }: Props) {
  const { slug } = await params;
  const template = await resolveTemplate(slug);

  if (!template) {
    notFound();
  }

  const fileTitle = `HRA보고서양식_${template.title}_v${template.version}`;

  return (
    <PrintView
      title={template.title}
      fileTitle={fileTitle}
      version={template.version}
      description={template.description}
      body={template.body}
    />
  );
}
