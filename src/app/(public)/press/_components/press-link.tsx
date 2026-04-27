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
    trackPressView(articleId);
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
