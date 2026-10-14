/** 수료생 이야기 폼에서 이미지 업로드와 메인 노출 옵션이 실제 제출값으로 제공되는지 검증합니다 (#127). */
import { createElement, isValidElement, type ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/markdown-editor", () => ({
  MarkdownEditor: ({ name }: { name: string }) => createElement("textarea", { name }),
}));
vi.mock("@/app/(public)/_components/calendar-section", () => ({
  CalendarSection: () => null,
}));

import { AlumniStoryForm } from "@/app/(admin)/admin/alumni/_components/alumni-story-form";
import Home from "@/app/(public)/page";
import { AlumniCarousel } from "@/app/(public)/_components/alumni-carousel";

afterEach(cleanup);

function containsCarousel(node: ReactNode): boolean {
  if (!isValidElement<{ children?: ReactNode }>(node)) return false;
  if (node.type === AlumniCarousel) return true;
  const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
  return children.some(containsCarousel);
}

describe("수료생 이야기 등록·노출", () => {
  it("사진 파일 입력과 메인 노출 체크박스를 제출 폼에 제공한다", () => {
    const view = render(createElement(AlumniStoryForm, {
      title: "새 수료생 이야기",
      submitLabel: "등록",
      action: async () => ({ success: false, message: "" }),
    }));

    const imageInput = view.container.querySelector<HTMLInputElement>('input[name="images"]');
    expect(imageInput?.type).toBe("file");
    expect(imageInput?.multiple).toBe(true);
    expect(imageInput?.accept).toBe("image/jpeg,image/png,image/webp");
    expect(view.container.querySelector('input[name="isFeatured"]')).not.toBeNull();
  });

  it("홈 화면에 메인 노출 수료생 캐러셀을 연결한다", async () => {
    const home = await Home({ searchParams: Promise.resolve({}) });
    expect(containsCarousel(home)).toBe(true);
  });
});
