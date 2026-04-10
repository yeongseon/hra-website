import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "자주 묻는 질문",
};

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return children;
}
