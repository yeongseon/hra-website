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
          className="inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
        >
          <ArrowLeft className="size-4" />
          갤러리 목록으로
        </Link>
        <Badge
          variant="outline"
          className="border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
        >
          HRA GALLERY
        </Badge>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-white">
          {gallery.title}
        </h1>
        {gallery.description ? (
          <p className="max-w-3xl whitespace-pre-line text-sm text-zinc-400 md:text-base">
            {gallery.description}
          </p>
        ) : (
          <p className="max-w-3xl text-sm text-zinc-500 md:text-base">설명이 없습니다.</p>
        )}
      </section>

      {gallery.images.length === 0 ? (
        <Card className="border-white/10 bg-zinc-950/80 py-10">
          <CardContent className="text-center text-base text-zinc-300">등록된 이미지가 없습니다.</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {gallery.images.map((image, index) => (
            <a
              key={`${image.url}-${index}`}
              href={image.url}
              target="_blank"
              rel="noreferrer"
              className="group block overflow-hidden rounded-xl border border-white/10 bg-zinc-950/80"
            >
              <div className="relative h-72 w-full bg-zinc-900">
                {image.url ? (
                  <img
                    src={image.url}
                    alt={image.alt ?? `${gallery.title} 이미지 ${index + 1}`}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-500">
                    <ImageIcon className="size-10" />
                  </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-end bg-gradient-to-t from-black/70 via-black/20 to-transparent p-3 text-zinc-200 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="inline-flex items-center gap-1 text-xs sm:text-sm">
                    원본 보기
                    <ExternalLink className="size-3.5" />
                  </span>
                </div>
              </div>
              <div className="border-t border-white/10 px-4 py-3 text-sm text-zinc-300">
                {image.alt && image.alt.length > 0 ? image.alt : `이미지 ${index + 1}`}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
