import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "커리큘럼",
};

export default function CurriculumLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
