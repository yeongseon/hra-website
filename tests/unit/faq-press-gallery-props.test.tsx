/**
 * #272 공개 FAQ, 관리자 FAQ·언론보도·갤러리 편집 페이지의 클라이언트 props 최소 투영(projection)을 검증합니다.
 * DB 행의 부가 메타데이터나 향후 추가 컬럼이 클라이언트 컴포넌트 props로 섞이지 않아야 합니다.
 */
import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  select: vi.fn(),
  galleryFindFirst: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({
  db: {
    select: mocks.select,
    query: {
      galleries: {
        findFirst: mocks.galleryFindFirst,
      },
    },
  },
}));
vi.mock("@/app/(public)/faq/_components/faq-content", () => ({ FaqContent: () => null }));
vi.mock("@/app/(admin)/admin/faq/_components/faq-contact-form", () => ({ FaqContactForm: () => null }));
vi.mock("@/app/(admin)/admin/faq/_components/faq-sortable-list", () => ({ FaqSortableList: () => null }));
vi.mock("@/app/(admin)/admin/press/_components/press-sortable-list", () => ({ PressSortableList: () => null }));
vi.mock("@/app/(admin)/admin/gallery/_components/gallery-form", () => ({ GalleryForm: () => null }));
vi.mock("@/app/(admin)/admin/gallery/_components/gallery-image-form", () => ({ GalleryImageForm: () => null }));
vi.mock("@/app/(admin)/admin/gallery/_components/gallery-image-sortable-grid", () => ({
  GalleryImageSortableGrid: () => null,
}));
vi.mock("@/features/gallery/actions", () => ({
  addGalleryImages: vi.fn(),
  updateGallery: vi.fn(),
}));

import FaqPage from "@/app/(public)/faq/page";
import { FaqContent } from "@/app/(public)/faq/_components/faq-content";
import AdminFaqPage from "@/app/(admin)/admin/faq/page";
import { FaqSortableList } from "@/app/(admin)/admin/faq/_components/faq-sortable-list";
import AdminPressPage from "@/app/(admin)/admin/press/page";
import { PressSortableList } from "@/app/(admin)/admin/press/_components/press-sortable-list";
import EditGalleryPage from "@/app/(admin)/admin/gallery/[id]/edit/page";
import { GalleryImageSortableGrid } from "@/app/(admin)/admin/gallery/_components/gallery-image-sortable-grid";

const galleryId = "10000000-0000-4000-8000-000000000001";
const itemId = "20000000-0000-4000-8000-000000000001";

function findBoundary<Props>(node: ReactNode, component: unknown): ReactElement<Props> | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === component && isValidElement<Props>(node)) return node;
  for (const child of Children.toArray(node.props.children)) {
    const found = findBoundary<Props>(child, component);
    if (found) return found;
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
});

describe("#272 FAQ·언론보도·갤러리 페이지의 클라이언트 props 최소 투영", () => {
  it("공개 FAQ 페이지는 연락처 문구와 질문·답변 3필드만 FaqContent에 전달한다", async () => {
    mocks.select
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                id: "contact-1",
                contactRole: "총무",
                contactName: "홍길동",
                contactPhone: "010-1234-5678",
                isActive: true,
                updatedAt: new Date(0),
              },
            ],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          orderBy: async () => [
            {
              id: itemId,
              question: "지원 자격이 어떻게 되나요?",
              answer: "학부생 누구나 지원할 수 있습니다.",
              order: 0,
              createdAt: new Date(0),
              updatedAt: new Date(1),
              futureField: "내부 전용",
            },
          ],
        }),
      });

    const page = await FaqPage();
    const content = findBoundary<ComponentProps<typeof FaqContent>>(page, FaqContent);
    expect(content).toBeDefined();
    expect(content?.props).toStrictEqual({
      contactText: "총무 홍길동 010-1234-5678",
      items: [
        {
          id: itemId,
          question: "지원 자격이 어떻게 되나요?",
          answer: "학부생 누구나 지원할 수 있습니다.",
        },
      ],
    });
    expect(Object.keys(mocks.select.mock.calls[0][0])).toEqual([
      "contactRole",
      "contactName",
      "contactPhone",
    ]);
    expect(Object.keys(mocks.select.mock.calls[1][0])).toEqual(["id", "question", "answer"]);
  });

  it("관리자 FAQ 페이지는 인가 후 정렬 목록에 필요한 4필드만 FaqSortableList에 전달한다", async () => {
    mocks.select.mockReturnValueOnce({
      from: () => ({
        orderBy: async () => [
          {
            id: itemId,
            question: "수업 시간은 언제인가요?",
            answer: "매주 토요일 오전입니다.",
            order: 1,
            createdAt: new Date(0),
            updatedAt: new Date(1),
          },
        ],
      }),
    });

    const page = await AdminFaqPage();
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.select.mock.invocationCallOrder[0],
    );
    expect(Object.keys(mocks.select.mock.calls[0][0])).toEqual([
      "id",
      "question",
      "answer",
      "order",
    ]);

    const list = findBoundary<ComponentProps<typeof FaqSortableList>>(page, FaqSortableList);
    expect(list?.props).toStrictEqual({
      initialItems: [
        {
          id: itemId,
          question: "수업 시간은 언제인가요?",
          answer: "매주 토요일 오전입니다.",
          order: 1,
        },
      ],
    });
  });

  it("관리자 언론보도 페이지는 인가 후 목록에 필요한 4필드만 PressSortableList에 전달한다", async () => {
    const publishedAt = new Date("2026-10-15T00:00:00.000Z");
    mocks.select.mockReturnValueOnce({
      from: () => ({
        orderBy: async () => [
          {
            id: itemId,
            title: "HRA 학술제 개최",
            source: "대학신문",
            publishedAt,
            url: "https://example.com/news",
            summary: "요약",
            imageUrl: "https://example.com/news.webp",
            viewCount: 99,
            order: 0,
            createdAt: new Date(0),
          },
        ],
      }),
    });

    const page = await AdminPressPage();
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(Object.keys(mocks.select.mock.calls[0][0])).toEqual([
      "id",
      "title",
      "source",
      "publishedAt",
    ]);

    const list = findBoundary<ComponentProps<typeof PressSortableList>>(page, PressSortableList);
    expect(list?.props).toStrictEqual({
      initialItems: [
        {
          id: itemId,
          title: "HRA 학술제 개최",
          source: "대학신문",
          publishedAt,
        },
      ],
    });
  });

  it("갤러리 편집 페이지는 이미지 그리드에 필요한 4필드만 전달하고 galleryId·createdAt을 제외한다", async () => {
    mocks.galleryFindFirst.mockResolvedValueOnce({
      id: galleryId,
      title: "가을 학술제",
      description: "설명",
      coverImageUrl: "https://example.com/cover.webp",
      createdAt: new Date(0),
      images: [
        {
          id: itemId,
          galleryId,
          url: "https://example.com/cover.webp",
          alt: "단체 사진",
          order: 0,
          createdAt: new Date(0),
        },
      ],
    });

    const page = await EditGalleryPage({ params: Promise.resolve({ id: galleryId }) });
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.galleryFindFirst.mock.calls[0][0]).toMatchObject({
      columns: {
        id: true,
        title: true,
        description: true,
        coverImageUrl: true,
      },
      with: {
        images: {
          columns: {
            id: true,
            url: true,
            alt: true,
            order: true,
          },
        },
      },
    });

    const grid = findBoundary<ComponentProps<typeof GalleryImageSortableGrid>>(
      page,
      GalleryImageSortableGrid,
    );
    expect(grid?.props).toStrictEqual({
      galleryId,
      coverImageUrl: "https://example.com/cover.webp",
      initialImages: [
        {
          id: itemId,
          url: "https://example.com/cover.webp",
          alt: "단체 사진",
          order: 0,
        },
      ],
    });
  });
});
