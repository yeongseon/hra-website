import { Badge } from "@/components/ui/badge";
import { Users, Calendar } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "기수 소개",
};

export default function CohortsPage() {
  return (
    <div className="mx-auto max-w-7xl px-6">
      <section className="py-20 md:py-32">
        <h1 className="text-4xl font-bold tracking-tight md:text-6xl text-white">
           기수 소개
         </h1>
        <p className="mt-6 text-xl text-gray-400 max-w-3xl leading-relaxed">
           커뮤니티의 기반을 이루는 뛰어난 인재들. 각 기수는 인문학과 기술의 교차점에 고유한 시각을 더합니다.
         </p>
      </section>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 pb-32">
        <div className="group relative flex flex-col justify-between rounded-3xl bg-white/5 border border-white/10 p-8 transition-all hover:bg-white/10 hover:-translate-y-1">
          <div>
            <div className="flex items-start justify-between mb-8">
              <h2 className="text-3xl font-bold tracking-tight text-white">
                 3기
               </h2>
               <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 rounded-full px-3 py-1">
                 예정
               </Badge>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center text-gray-400">
                <Calendar className="w-5 h-5 mr-3 text-gray-500" />
                <span>2026.03 - 2026.12</span>
              </div>
              <div className="flex items-center text-gray-400">
                <Users className="w-5 h-5 mr-3 text-gray-500" />
                 <span>모집 예정</span>
              </div>
            </div>
          </div>
          
          <div className="mt-12 pt-6 border-t border-white/10">
            <p className="text-gray-500 text-sm">곧 지원 접수가 시작됩니다.</p>
          </div>
        </div>

        <div className="group relative flex flex-col justify-between rounded-3xl bg-white/5 border border-white/10 p-8 transition-all hover:bg-white/10 hover:-translate-y-1">
          <div>
            <div className="flex items-start justify-between mb-8">
              <h2 className="text-3xl font-bold tracking-tight text-white">
                 2기
               </h2>
               <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 rounded-full px-3 py-1">
                 진행중
               </Badge>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center text-gray-400">
                <Calendar className="w-5 h-5 mr-3 text-gray-500" />
                <span>2025.03 - 2025.12</span>
              </div>
              <div className="flex items-center text-gray-400">
                <Users className="w-5 h-5 mr-3 text-gray-500" />
                 <span>24명</span>
              </div>
            </div>
          </div>
          
          <div className="mt-12 pt-6 border-t border-white/10">
            <p className="text-gray-500 text-sm">현재 커리큘럼을 진행 중입니다.</p>
          </div>
        </div>

        <div className="group relative flex flex-col justify-between rounded-3xl bg-white/5 border border-white/10 p-8 transition-all hover:bg-white/10 hover:-translate-y-1">
          <div>
            <div className="flex items-start justify-between mb-8">
              <h2 className="text-3xl font-bold tracking-tight text-white">
                 1기
               </h2>
               <Badge variant="outline" className="bg-white/5 text-gray-400 border-white/10 rounded-full px-3 py-1">
                 수료
               </Badge>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center text-gray-400">
                <Calendar className="w-5 h-5 mr-3 text-gray-500" />
                <span>2024.03 - 2024.12</span>
              </div>
              <div className="flex items-center text-gray-400">
                <Users className="w-5 h-5 mr-3 text-gray-500" />
                 <span>18명</span>
              </div>
            </div>
          </div>
          
          <div className="mt-12 pt-6 border-t border-white/10">
            <p className="text-gray-500 text-sm">HRA의 창립 기수입니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
