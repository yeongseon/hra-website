/**
 * 갤러리 상세 페이지
 *
 * 역할:
 * - 선택한 갤러리 앨범의 제목, 설명, 이미지 목록을 보여줍니다.
 * - DB에 저장된 이미지 순서를 그대로 유지해 공개 페이지에 노출합니다.
 */

import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { asc, eq, sql } from "drizzle-orm";
import { ArrowLeft, ExternalLink, ImageIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod/v4";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";
import { galleries, galleryImages } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type GalleryDetailPageProps = {
  params: Promise<{ id: string }>;
};

async function getGalleryById(id: string) {
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return null;
  }

  return db.query.galleries.findFirst({
    where: eq(galleries.id, parsedId.data),
    with: {
      images: {
        orderBy: [asc(galleryImages.order), asc(galleryImages.createdAt)],
      },
    },
  });
}

export async function generateMetadata({ params }: GalleryDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const gallery = await getGalleryById(id);

  if (!gallery) {
    return { title: "갤러리" };
  }

  const description = gallery.description?.slice(0, 160) ?? "HRA 갤러리";
  const firstImage = gallery.images[0]?.url;

  return {
    title: gallery.title,
    description,
    openGraph: {
      title: gallery.title,
      description,
      type: "article",
      url: `/gallery/${gallery.id}`,
      images: firstImage ? [{ url: firstImage, alt: gallery.title }] : undefined,
    },
    twitter: {
      title: gallery.title,
      description,
      images: firstImage ? [firstImage] : undefined,
    },
  };
}

export default async function GalleryDetailPage({ params }: GalleryDetailPageProps) {
  const { id } = await params;
  const gallery = await getGalleryById(id);

  if (!gallery) {
    notFound();
  }

  // 조회수 증가 (fire-and-forget)
  db.update(galleries)
    .set({ viewCount: sql`${galleries.viewCount} + 1` })
    .where(eq(galleries.id, gallery.id))
    .then(() => {});

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-20">
      <section className="mb-10 space-y-4">
        <Link
          href="/gallery"
          className="inline-flex items-center gap-2 text-sm text-[#666666] transition-colors hover:text-[#1a1a1a]"
        >
          <ArrowLeft className="size-4" />
          갤러리 목록으로
        </Link>
        <Badge
          variant="outline"
          className="border-emerald-300 bg-emerald-50 text-emerald-700"
        >
          HRA GALLERY
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a] sm:text-3xl md:text-4xl">
          {gallery.title}
        </h1>
        <p className="text-xs text-[#666666]">조회수 {gallery.viewCount}</p>
        {gallery.description ? (
          <p className="max-w-3xl whitespace-pre-line text-sm text-[#666666] md:text-base">
            {gallery.description}
          </p>
        ) : (
          <p className="max-w-3xl text-sm text-[#666666] md:text-base">설명이 없습니다.</p>
        )}
      </section>

      {gallery.images.length === 0 ? (
        <Card className="rounded-2xl border-[#D9D9D9] bg-white py-10 shadow-[var(--shadow-soft)]">
          <CardContent className="text-center text-base text-[#666666]">
            등록된 이미지가 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {gallery.images.map((image, index) => (
            <a
              key={image.id}
              href={image.url}
              target="_blank"
              rel="noreferrer"
              className="group block overflow-hidden rounded-2xl border border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)]"
            >
                <div className="relative h-72 w-full bg-gray-100">
                  {image.url ? (
                    <Image
                      src={image.url}
                      alt={image.alt ?? `${gallery.title} 이미지 ${index + 1}`}
                      width={1200}
                      height={800}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                  <div className="flex h-full w-full items-center justify-center text-[#666666]">
                    <ImageIcon className="size-10" />
                  </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-end bg-gradient-to-t from-white/95 via-white/80 to-transparent p-3 text-[#1a1a1a] opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="inline-flex items-center gap-1 text-xs sm:text-sm">
                    원본 보기
                    <ExternalLink className="size-3.5" />
                  </span>
                </div>
              </div>
              <div className="border-t border-[#D9D9D9] px-4 py-3 text-sm text-[#666666]">
                {image.alt && image.alt.length > 0 ? image.alt : `이미지 ${index + 1}`}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
