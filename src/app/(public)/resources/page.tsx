import type { Metadata } from "next";
import { BookMarked, BookOpen, FileText, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "자료실",
};

export default function ResourcesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <section className="mb-10 sm:mb-14 space-y-4 text-center sm:text-left">
        <Badge
          variant="outline"
          className="border-amber-500/50 bg-amber-500/10 text-amber-200"
        >
          HRA RESOURCES
        </Badge>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-white">
          자료실
        </h1>
        <p className="max-w-2xl text-sm text-zinc-400 md:text-base mx-auto sm:mx-0">
          수업일지, 주차별 텍스트, 가이드북 등 HRA 교육 자료를 확인하세요.
        </p>
      </section>

      <section className="mb-12">
        <div className="relative overflow-hidden rounded-2xl bg-amber-500/5 border border-amber-500/20 p-6 md:p-8">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/50" />
          <div className="flex items-start sm:items-center gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Info className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-amber-200 mb-1">열람 권한 안내</h3>
              <p className="text-zinc-300 text-sm md:text-base leading-relaxed">
                자료실은 수료생, 교수진, 운영진 등 내부 회원만 열람할 수 있습니다. 로그인 후 이용해 주세요.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="group relative overflow-hidden border-white/10 bg-zinc-950/80 hover:bg-zinc-900/90 hover:border-amber-500/30 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="relative pb-4 pt-8 px-8">
            <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-white/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
              <FileText className="w-6 h-6 text-amber-400" />
            </div>
            <CardTitle className="text-xl font-bold text-white">수업일지</CardTitle>
          </CardHeader>
          <CardContent className="relative px-8 pb-8">
            <p className="text-zinc-400 text-sm leading-relaxed">
              매주 진행되는 HRA 수업의 주요 내용과 토론 결과, 참가자들의 인사이트를 기록한 일지입니다.
            </p>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden border-white/10 bg-zinc-950/80 hover:bg-zinc-900/90 hover:border-amber-500/30 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="relative pb-4 pt-8 px-8">
            <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-white/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
              <BookOpen className="w-6 h-6 text-amber-400" />
            </div>
            <CardTitle className="text-xl font-bold text-white">주차별 텍스트</CardTitle>
          </CardHeader>
          <CardContent className="relative px-8 pb-8">
            <p className="text-zinc-400 text-sm leading-relaxed">
              수업 전 반드시 읽어야 할 고전 및 현대 문헌 자료와 참고 아티클을 제공합니다.
            </p>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden border-white/10 bg-zinc-950/80 hover:bg-zinc-900/90 hover:border-amber-500/30 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="relative pb-4 pt-8 px-8">
            <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-white/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
              <BookMarked className="w-6 h-6 text-amber-400" />
            </div>
            <CardTitle className="text-xl font-bold text-white">가이드북</CardTitle>
          </CardHeader>
          <CardContent className="relative px-8 pb-8">
            <p className="text-zinc-400 text-sm leading-relaxed">
              HRA 커리큘럼, 과제 제출 양식, 프로그램 수료 기준 등 아카데미 생활에 필요한 안내서입니다.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
