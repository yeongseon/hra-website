/**
 * 갤러리 편집 페이지
 *
 * 역할:
 * - 갤러리 기본 정보를 수정합니다.
 * - 갤러리에 속한 이미지 업로드/삭제를 관리합니다.
 * - 삭제 시 현재 커버 이미지 상태를 함께 보여줍니다.
 */

import Image from "next/image";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft, ImageIcon, Star, Trash2 } from "lucide-react";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GalleryForm } from "@/app/(admin)/admin/gallery/_components/gallery-form";
import { GalleryImageForm } from "@/app/(admin)/admin/gallery/_components/gallery-image-form";
import {
  addGalleryImages,
  deleteGalleryImage,
  updateGallery,
} from "@/features/gallery/actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { galleries, galleryImages } from "@/lib/db/schema";

type EditGalleryPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditGalleryPage({ params }: EditGalleryPageProps) {
  await requireAdmin();

  const { id } = await params;
  const parsedId = z.uuid().safeParse(id);

  if (!parsedId.success) {
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

  const gallery = await db.query.galleries.findFirst({
    where: eq(galleries.id, parsedId.data),
    with: {
      images: {
        orderBy: [asc(galleryImages.order), asc(galleryImages.createdAt)],
      },
    },
  });

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

  const updateAction = updateGallery.bind(null, gallery.id);
  const addImageAction = addGalleryImages.bind(null, gallery.id);

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
        }}
      />

      <Card className="border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-100 py-6">
          <CardTitle className="text-xl text-slate-900">이미지 관리</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 py-6">
          <GalleryImageForm action={addImageAction} />

          {gallery.images.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
              아직 등록된 이미지가 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {gallery.images.map((image) => {
                const deleteAction = async () => {
                  "use server";
                  await deleteGalleryImage(gallery.id, image.id);
                };

                return (
                  <div
                    key={image.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                  >
                    <div className="relative h-44 w-full bg-slate-100">
                      {image.url ? (
                        <Image
                          src={image.url}
                          alt={image.alt ?? "갤러리 이미지"}
                          fill
                          sizes="(max-width: 768px) 100vw, 33vw"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          <ImageIcon className="size-8" />
                        </div>
                      )}

                      {gallery.coverImageUrl === image.url ? (
                        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-1 text-xs font-medium text-white">
                          <Star className="size-3" />
                          커버
                        </span>
                      ) : null}
                    </div>

                    <div className="space-y-3 p-4 text-sm text-slate-600">
                      <p className="line-clamp-2 min-h-10 break-all">{image.alt || "(대체 텍스트 없음)"}</p>
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
