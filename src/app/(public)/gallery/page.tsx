import type { Metadata } from "next";
import { ImageIcon } from "lucide-react";
import { count, desc, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { galleries, galleryImages } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "갤러리",
};

export default async function GalleryPage() {
  const albums = await db
    .select({
      id: galleries.id,
      title: galleries.title,
      coverImageUrl: galleries.coverImageUrl,
      imageCount: count(galleryImages.id),
    })
    .from(galleries)
    .leftJoin(galleryImages, eq(galleryImages.galleryId, galleries.id))
    .groupBy(galleries.id)
    .orderBy(desc(galleries.createdAt));

  return (
    <div className="mx-auto max-w-7xl px-6 py-20 md:py-32">
      <section className="mb-14 space-y-4">
        <Badge
          variant="outline"
          className="border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
        >
          HRA GALLERY
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
          갤러리
        </h1>
        <p className="max-w-2xl text-sm text-zinc-400 md:text-base">
          HRA의 활동 기록을 앨범으로 만나보세요.
        </p>
      </section>

      {albums.length === 0 ? (
        <Card className="border-white/10 bg-zinc-950/80 py-10">
          <CardContent className="text-center text-base text-zinc-300">
            갤러리가 없습니다
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {albums.map((album) => {
            const imageCount = Number(album.imageCount ?? 0);

            return (
              <Card
                key={album.id}
                className="border-white/10 bg-zinc-950/80 py-0 transition-colors hover:border-emerald-400/60 hover:bg-zinc-900/90"
              >
                {album.coverImageUrl && imageCount > 0 ? (
                  <img
                    src={album.coverImageUrl}
                    alt={album.title}
                    className="h-52 w-full rounded-t-xl object-cover"
                  />
                ) : (
                  <div className="relative h-52 overflow-hidden rounded-t-xl bg-gradient-to-br from-emerald-500/25 via-cyan-500/10 to-zinc-900">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(16,185,129,0.28),transparent_35%),radial-gradient(circle_at_82%_72%,rgba(34,211,238,0.2),transparent_30%)]" />
                    <div className="absolute inset-0 flex items-center justify-center text-zinc-200/80">
                      <ImageIcon className="size-10" />
                    </div>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="line-clamp-1 text-lg text-white">
                    {album.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-5 text-sm text-zinc-400">
                  이미지 {imageCount}장
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
