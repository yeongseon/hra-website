import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { GalleryForm } from "@/app/(admin)/admin/gallery/_components/gallery-form";
import { createGallery } from "@/features/gallery/actions";
import { requireAdmin } from "@/lib/admin";

export default async function NewGalleryPage() {
  await requireAdmin();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">새 앨범 추가</h1>
          <p className="text-sm text-slate-500">새 갤러리 앨범을 생성합니다.</p>
        </div>
        <Link
          href="/admin/gallery"
          className={buttonVariants({
            variant: "outline",
            className: "border-slate-200 text-slate-700",
          })}
        >
          <ChevronLeft className="mr-1 size-4" />
          목록으로
        </Link>
      </div>

      <GalleryForm
        action={createGallery}
        submitLabel="앨범 생성"
        successRedirectPath="/admin/gallery"
      />
    </div>
  );
}
