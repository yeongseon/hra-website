import Link from "next/link";
import { ArrowLeft, ImageIcon, Star, Trash2 } from "lucide-react";
import { z } from "zod/v4";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GalleryForm } from "@/app/(admin)/admin/gallery/_components/gallery-form";
import { GalleryImageForm } from "@/app/(admin)/admin/gallery/_components/gallery-image-form";
import {
  addGalleryImage,
  deleteGalleryImage,
  updateGallery,
} from "@/features/gallery/actions";
import { requireAdmin } from "@/lib/admin";
import { getFile } from "@/lib/github";

type EditGalleryPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

const galleryMetadataSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  coverImageUrl: z.string().nullable().optional(),
  images: z
    .array(
      z.object({
        url: z.string(),
        alt: z.string().optional(),
        order: z.number().int(),
      }),
    )
    .default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export default async function EditGalleryPage({ params }: EditGalleryPageProps) {
  await requireAdmin();

  const { slug } = await params;
  const filePath = `content/gallery/${slug}.json`;
  const file = await getFile(filePath);

  if (!file) {
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

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(file.content);
  } catch {
    parsedJson = null;
  }

  const parsedGallery = galleryMetadataSchema.safeParse(parsedJson);

  if (!parsedGallery.success) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <Card className="border-slate-200 bg-white py-10 shadow-sm">
          <CardContent className="space-y-4 text-center">
            <p className="text-lg font-medium text-slate-900">앨범 데이터를 읽을 수 없습니다.</p>
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

  const gallery = {
    ...parsedGallery.data,
    coverImageUrl: parsedGallery.data.coverImageUrl ?? null,
    images: [...parsedGallery.data.images].sort((a, b) => a.order - b.order),
  };

  const updateAction = updateGallery.bind(null, slug);
  const addImageAction = addGalleryImage.bind(null, slug);

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
              {gallery.images.map((image, index) => {
                const deleteAction = async () => {
                  "use server";
                  await deleteGalleryImage(slug, image.url);
                };

                return (
                  <div
                    key={`${image.url}-${index}`}
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
