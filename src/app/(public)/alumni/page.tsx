import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "수료생 이야기",
};

const alumniStories = [
  {
    id: 1,
    name: "17기 수료생",
    quote: "한계까지 도전하고, 성장으로 보답하다",
    story:
      "HRA에서의 1년은 단순한 교육이 아닌, 삶의 전환점이었습니다. 고전 읽기와 토론을 통해 깊이 사고하는 법을 배웠고, 케이스 스터디를 통해 실제 문제를 해결하는 역량을 키웠습니다.",
    image: "/images/alumni-1.jpg",
  },
  {
    id: 2,
    name: "18기 수료생",
    quote: "본질을 묻는 힘, 현업에서의 차이를 만들다",
    story:
      "HRA에서 배운 본질적 사고력은 직장에서도 큰 차이를 만들어 주었습니다. 문제의 표면이 아닌 근본을 파악하는 습관이 자연스럽게 업무에 녹아들었습니다.",
    image: "/images/alumni-2.jpg",
  },
  {
    id: 3,
    name: "19기 수료생",
    quote: "평생을 함께할 최고의 동료들을 얻었습니다",
    story:
      "HRA에서 가장 값진 것은 함께 성장한 동료들입니다. 매주 토요일 함께 고민하고 토론하며 쌓은 유대는 수료 후에도 계속되고 있습니다.",
    image: "/images/alumni-3.jpg",
  },
];

export default function AlumniPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
      <section className="py-16 sm:py-20 text-center">
        <h1 className="text-[40px] font-bold leading-tight text-[#1a1a1a]">수료생 이야기</h1>
        <div className="mx-auto mt-[25px] mb-[5px] h-1 w-12 bg-[var(--brand)]" />
        <p className="mt-5 mx-auto max-w-3xl text-lg leading-relaxed text-[#666666]">
          HRA를 거쳐 간 수료생들이 각자의 자리에서 어떻게 성장했는지, 그 변화의 순간을 짧은 이야기로 전합니다.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {alumniStories.map((story) => (
          <article
            key={story.id}
            className="overflow-hidden rounded-2xl border border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)]"
          >
            <div className="aspect-video rounded-t-2xl bg-gray-100 px-6 py-8">
              <div className="flex h-full flex-col justify-between rounded-xl border border-dashed border-[#D9D9D9] bg-white/70 p-5">
                <span className="text-sm font-medium text-blue-600">{story.name}</span>
                <div>
                  <p className="text-base font-semibold text-[#1a1a1a]">이미지 준비 중</p>
                  <p className="mt-2 text-sm text-[#666666]">{story.image}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col p-6">
              <p className="text-sm font-semibold text-blue-600">{story.name}</p>
              <h2 className="mt-3 text-2xl font-bold leading-snug text-[#1a1a1a]">{story.quote}</h2>
              <p className="mt-4 flex-1 text-lg leading-relaxed text-[#666666]">{story.story}</p>
              <span className="mt-6 inline-flex items-center text-base font-semibold text-[#2563EB]">
                수료생 후기
              </span>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
