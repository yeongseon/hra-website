/**
 * 갤러리 페이지 (src/app/(public)/gallery/page.tsx)
 * 
 * HRA의 활동 사진 앨범을 보여주는 페이지입니다.
 * 서버 컴포넌트에서 DB에 저장된 갤러리 앨범 정보를 조회해서 표시합니다.
 * - 각 앨범은 커버 이미지와 이미지 개수 표시
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAllGalleries } from "@/lib/content/gallery";

/**
 * SEO 최적화: 이 페이지가 검색엔진에 어떻게 표시될지 설정
 * 페이지 제목은 "갤러리"로 표시됨
 */
export const metadata: Metadata = {
  title: "갤러리",
};

export default async function GalleryPage() {
  const albums = await getAllGalleries();

   return (
     <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
       {/* 갤러리 페이지 헤더 */}
       <section className="mb-10 sm:mb-14 space-y-4">
        <Badge
          variant="outline"
          className="border-emerald-300 bg-emerald-50 text-emerald-700"
        >
          HRA GALLERY
        </Badge>
        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-[#1a1a1a]">
          갤러리
        </h1>
        <p className="max-w-2xl text-sm text-[#666666] md:text-base">
          수업, 행사, 기수별 사진 모음을 만나보세요.
        </p>
      </section>

       {albums.length === 0 ? (
         <Card className="border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] rounded-2xl py-10">
            <CardContent className="text-center text-base text-[#666666]">
              갤러리가 없습니다
            </CardContent>
          </Card>
       ) : (
         /* 갤러리 앨범들을 3열 그리드로 표시 */
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
           {albums.map((album) => {
             const imageCount = album.images.length;

             return (
               <Link key={album.slug} href={`/gallery/${album.slug}`} className="group block">
                  <Card className="border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] rounded-2xl py-0 transition-colors hover:border-blue-400 hover:bg-gray-50">
                   {album.coverImageUrl && imageCount > 0 ? (
                     <img
                       src={album.coverImageUrl}
                       alt={album.title}
                       className="h-52 w-full rounded-t-xl object-cover"
                     />
                   ) : (
                      <div className="relative h-52 overflow-hidden rounded-t-xl bg-gradient-to-br from-emerald-50 via-blue-50 to-gray-100">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(16,185,129,0.18),transparent_35%),radial-gradient(circle_at_82%_72%,rgba(34,211,238,0.14),transparent_30%)]" />
                        <div className="absolute inset-0 flex items-center justify-center text-[#666666]">
                          <ImageIcon className="size-10" />
                        </div>
                      </div>
                    )}
                    <CardHeader>
                      <CardTitle className="line-clamp-1 text-lg text-[#1a1a1a] group-hover:text-blue-600">
                        {album.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pb-5 text-sm text-[#666666]">이미지 {imageCount}장</CardContent>
                  </Card>
               </Link>
             );
           })}
         </div>
      )}
    </div>
  );
}
