import Link from "next/link";
import { ArrowLeft, ExternalLink, ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAllGalleries, getGalleryBySlug } from "@/lib/content/gallery";
import { notFound } from "next/navigation";

export async function generateStaticParams() {
  const galleries = await getAllGalleries();
  return galleries.map((g) => ({ slug: g.slug }));
}

type GalleryDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function GalleryDetailPage({ params }: GalleryDetailPageProps) {
  const { slug } = await params;
  const gallery = await getGalleryBySlug(slug);

  if (!gallery) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20">
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
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-[#1a1a1a]">
          {gallery.title}
        </h1>
        {gallery.description ? (
          <p className="max-w-3xl whitespace-pre-line text-sm text-[#666666] md:text-base">
            {gallery.description}
          </p>
        ) : (
          <p className="max-w-3xl text-sm text-[#666666] md:text-base">설명이 없습니다.</p>
        )}
      </section>

      {gallery.images.length === 0 ? (
        <Card className="border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] rounded-2xl py-10">
          <CardContent className="text-center text-base text-[#666666]">등록된 이미지가 없습니다.</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {gallery.images.map((image, index) => (
            <a
              key={`${image.url}-${index}`}
              href={image.url}
              target="_blank"
              rel="noreferrer"
              className="group block overflow-hidden rounded-2xl border border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)]"
            >
              <div className="relative h-72 w-full bg-gray-100">
                {image.url ? (
                  <img
                    src={image.url}
                    alt={image.alt ?? `${gallery.title} 이미지 ${index + 1}`}
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
