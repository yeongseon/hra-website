/** 실제 관리자 에디터와 공개 미리보기를 인증·DB·업로드 없이 띄우는 브라우저 QA 전용 화면입니다. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import "@/app/globals.css";

const body = [
  "## 본문 시작", "", "[첫 번째 본문 링크](#본문시작)", "",
  '![합성 검증 이미지](/images/preview.svg "합성 이미지 설명")', "",
  "| 항목 | 확인 내용 |", "| --- | --- |", "| 이미지 | 대체 텍스트와 제목 |", "| 표 | 키보드로 긴 본문 읽기 |", "",
  ...Array.from({ length: 35 }, (_, index) => `### ${index + 1}번째 단락\n\n키보드로 읽는 긴 본문입니다. 이미지와 표를 지난 뒤에도 미리보기 안에서 본문을 스크롤하고 닫기 버튼으로 돌아갈 수 있어야 합니다.\n`),
  "[마지막 본문 링크](#본문끝)",
].join("\n");

function Fixture() {
  const [clicks, setClicks] = useState(0);
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-8">
      <h1>에디터 미리보기 접근성 검증</h1>
      <button id="background-before" onClick={() => setClicks((value) => value + 1)}>배경 버튼</button>
      <span id="background-count">배경 실행 {clicks}회</span>
      <RichTextEditor name="body" defaultValue={body} previewTitle="이미지와 표가 있는 긴 본문" />
      <button id="background-after">마지막 배경 버튼</button>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("검증 화면의 시작 요소를 찾지 못했습니다.");
createRoot(root).render(<Fixture />);
