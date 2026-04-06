/**
 * 갤러리 관리 페이지 (목록)
 *
 * 역할: 관리자가 등록된 모든 앨범을 카드 형태로 볼 수 있는 페이지
 * - 앨범 목록 조회 (썸네일, 제목, 설명, 이미지 개수)
 * - 각 앨범별 수정/삭제 액션
 * - "새 앨범 추가" 버튼으로 새 항목 생성 가능
 *
 * 데이터 흐름: DB에서 모든 앨범 + 각 앨범의 이미지 개수 조회
 */

import Link from "next/link";
import { CalendarDays, ImageIcon, PencilLine, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GalleryDeleteButton } from "@/app/(admin)/admin/gallery/_components/gallery-delete-button";
import { requireAdmin } from "@/lib/admin";
import { getAllGalleries } from "@/lib/content/gallery";

const formatCreatedDate = (isoDate: string) => {
  const parsedDate = new Date(isoDate);

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsedDate);
};

const excerptDescription = (value: string | undefined, maxLength = 90) => {
  if (!value) {
    return "설명이 아직 없습니다.";
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trim()}...`;
};

export default async function AdminGalleryPage() {
  // 🔒 관리자 권한 확인
  await requireAdmin();

  const albums = await getAllGalleries();

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6 px-4 sm:px-6 py-6 sm:py-10">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">갤러리 관리</h1>
          <p className="text-sm text-slate-500">앨범을 추가하고 이미지를 관리할 수 있습니다.</p>
        </div>
        <Link
          href="/admin/gallery/new"
          className={buttonVariants({ className: "bg-slate-900 hover:bg-slate-700" })}
        >
          <Plus className="mr-1 size-4" />새 앨범 추가
        </Link>
      </section>

      {albums.length === 0 ? (
        <Card className="border-slate-200 bg-white py-12 shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 text-center text-slate-500">
            <ImageIcon className="size-8 text-slate-300" />
            <p>등록된 앨범이 없습니다.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {albums.map((album) => {
            const imageCount = album.images.length;

            return (
              <Card key={album.slug} className="overflow-hidden border-slate-200 bg-white py-0 shadow-sm">
                {album.coverImageUrl ? (
                  <img
                    src={album.coverImageUrl}
                    alt={album.title}
                    className="h-52 w-full bg-slate-100 object-cover"
                  />
                ) : (
                  <div className="relative h-52 w-full bg-gradient-to-br from-slate-100 via-zinc-50 to-slate-200">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_20%,rgba(148,163,184,0.25),transparent_36%),radial-gradient(circle_at_76%_76%,rgba(14,165,233,0.18),transparent_34%)]" />
                    <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                      <ImageIcon className="size-9" />
                    </div>
                  </div>
                )}

                <CardHeader className="space-y-2">
                  <CardTitle className="line-clamp-1 text-xl text-slate-900">{album.title}</CardTitle>
                  <CardDescription className="line-clamp-3 min-h-[4.25rem] text-slate-500">
                    {excerptDescription(album.description)}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-1 text-sm text-slate-500">
                  <p>이미지 {imageCount}장</p>
                  <p className="inline-flex items-center gap-1">
                    <CalendarDays className="size-4" />
                    {formatCreatedDate(album.createdAt)} 생성
                  </p>
                </CardContent>

                <CardFooter className="flex items-center justify-between gap-2 border-t border-slate-100 py-4">
                  <Link
                    href={`/admin/gallery/${album.slug}/edit`}
                    className={buttonVariants({
                      variant: "outline",
                      className: "border-slate-200 text-slate-700",
                    })}
                  >
                    <PencilLine className="mr-1 size-4" />
                    수정
                  </Link>

                  <GalleryDeleteButton slug={album.slug} />
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
