import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "모집 설정 관리",
};

export default function RecruitmentSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
