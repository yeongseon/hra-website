import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "자주 묻는 질문",
  description: "HRA 지원, 학사, 수료 등 자주 묻는 질문에 대한 답변과 연락처를 안내합니다.",
};

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return children;
}
