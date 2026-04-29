import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { ClassMaterialUploadForm } from "@/app/(member)/resources/class-materials/_components/class-material-upload-form";
import { createClassMaterial } from "@/features/class-materials/actions";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "강의 자료 업로드",
};

export const dynamic = "force-dynamic";

export default async function ClassMaterialsUploadPage() {
  const session = await auth();
  const role = session?.user?.role;

  if (role !== "ADMIN" && role !== "FACULTY") {
    redirect("/resources");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-20 md:py-32">
      <div className="mb-8">
        <Link
          href="/resources"
          className="inline-flex items-center text-sm font-medium text-[#666666] transition-colors hover:text-[#1a1a1a]"
        >
          <ArrowLeft className="mr-2 size-4" />
          자료실
        </Link>
      </div>

      <section className="mb-10 space-y-4 text-center sm:mb-14 sm:text-left">
        <h1 className="text-3xl font-semibold tracking-tight text-[#1a1a1a] sm:text-4xl md:text-5xl">
          강의 자료 업로드
        </h1>
        <p className="mx-auto max-w-2xl text-sm text-[#666666] sm:mx-0 md:text-base">
          교수진과 운영진이 강의용 문서, 발표 자료, 참고 파일을 빠르게 등록할 수 있는 전용
          공간입니다.
        </p>
      </section>

      <ClassMaterialUploadForm action={createClassMaterial} />
    </div>
  );
}
