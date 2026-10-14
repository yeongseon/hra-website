"use client";

import { trackPressView } from "@/features/press/actions";

interface PressLinkProps {
  articleId: string;
  href: string;
  children: React.ReactNode;
  className?: string;
}

export function PressLink({ articleId, href, children, className }: PressLinkProps) {
  const handleClick = () => {
    void trackPressView(articleId).catch((error) => {
      // 기사 링크 이동은 유지하되 조회수 기록 실패는 진단할 수 있도록 남깁니다.
      console.error("언론보도 조회수 기록 실패:", error);
    });
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={handleClick}
      className={className}
    >
      {children}
    </a>
  );
}
