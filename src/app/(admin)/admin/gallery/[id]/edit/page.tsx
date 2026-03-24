import Link from "next/link";
import { ArrowLeft, ImageIcon, Trash2 } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GalleryForm } from "@/app/(admin)/admin/gallery/_components/gallery-form";
import { GalleryImageForm } from "@/app/(admin)/admin/gallery/[id]/edit/_components/gallery-image-form";
import {
  addGalleryImage,
  deleteGalleryImage,
  updateGallery,
} from "@/features/gallery/actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { galleries, galleryImages } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type EditGalleryPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditGalleryPage({ params }: EditGalleryPageProps) {
  await requireAdmin();

  const { id } = await params;

  const [gallery] = await db.select().from(galleries).where(eq(galleries.id, id)).limit(1);

  if (!gallery) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <Card className="border-slate-200 bg-white py-10 shadow-sm">
          <CardContent className="space-y-4 text-center">
            <p className="text-lg font-medium text-slate-900">앨범을 찾을 수 없습니다.</p>
            <Link
              href="/admin/gallery"
              className={buttonVariants({
                variant: "outline",
                className: "border-slate-200 text-slate-700",
              })}
            >
              갤러리 목록으로 돌아가기
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const images = await db
    .select()
    .from(galleryImages)
    .where(eq(galleryImages.galleryId, id))
    .orderBy(asc(galleryImages.order), asc(galleryImages.createdAt));

  const updateAction = updateGallery.bind(null, id);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-6 py-10">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">앨범 수정</h1>
          <p className="text-sm text-slate-500">기본 정보와 이미지를 관리합니다.</p>
        </div>
        <Link
          href="/admin/gallery"
          className={buttonVariants({
            variant: "outline",
            className: "border-slate-200 text-slate-700",
          })}
        >
          <ArrowLeft className="mr-1 size-4" />
          목록으로
        </Link>
      </section>

      <GalleryForm
        action={updateAction}
        submitLabel="변경사항 저장"
        defaultValues={{
          title: gallery.title,
          description: gallery.description,
          coverImageUrl: gallery.coverImageUrl,
        }}
      />

      <Card className="border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-100 py-6">
          <CardTitle className="text-xl text-slate-900">이미지 관리</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 py-6">
          <GalleryImageForm galleryId={id} action={addGalleryImage} />

          {images.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
              아직 등록된 이미지가 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {images.map((image) => {
                const deleteAction = async () => {
                  "use server";
                  await deleteGalleryImage(image.id);
                };

                return (
                  <div
                    key={image.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                  >
                    <div className="relative h-44 w-full bg-slate-100">
                      {image.url ? (
                        <img
                          src={image.url}
                          alt={image.alt ?? "갤러리 이미지"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          <ImageIcon className="size-8" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 p-4 text-sm text-slate-600">
                      <p className="line-clamp-2 min-h-10">{image.alt || "(대체 텍스트 없음)"}</p>
                      <p>정렬 순서: {image.order}</p>
                      <form action={deleteAction}>
                        <Button type="submit" variant="destructive" className="w-full">
                          <Trash2 className="mr-1 size-4" />이미지 삭제
                        </Button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
