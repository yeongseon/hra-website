/**
 * 푸터 컴포넌트 - 사이트 하단 영역
 *
 * 이 컴포넌트는 HRA 웹사이트의 맨 아래에 표시되는 푸터를 만듭니다.
 * - HRA 소개 및 간단한 설명 (좌측)
 * - 헤더 구조와 맞춘 주요 메뉴 링크 (중앙)
 * - 저작권 표시
 *
 * 참고: 이 컴포넌트는 "use client"가 없으므로 서버 컴포넌트입니다.
 * 서버 컴포넌트는 상호작용이 없고 정보만 표시할 때 사용합니다.
 */

import Link from "next/link";
import { Mail } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-[#D9D9D9] bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-8 py-16 md:grid-cols-[1fr_2fr]">
          <div>
            <h3 className="text-xl font-bold text-[#1a1a1a]">HRA</h3>
            <p className="mt-2 text-sm text-[#666666]">
              Human Renaissance Academy
            </p>
            <p className="mt-1 text-sm text-[#666666]">
              고전 읽기와 토론, 케이스 스터디를 통해 사고력과 실천력을 기르는 1년 프로그램
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <div>
              <h4 className="mb-4 text-sm font-semibold text-[#1a1a1a]">HRA소개</h4>
              <ul className="space-y-3">
                <li>
                  <Link href="/about" className="text-sm text-[#666666] transition-colors hover:text-[#1a1a1a]">
                    HRA
                  </Link>
                </li>
                <li>
                  <Link href="/curriculum" className="text-sm text-[#666666] transition-colors hover:text-[#1a1a1a]">
                    커리큘럼
                  </Link>
                </li>
                <li>
                  <Link href="/faculty" className="text-sm text-[#666666] transition-colors hover:text-[#1a1a1a]">
                    교수진
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-semibold text-[#1a1a1a]">입학안내</h4>
              <ul className="space-y-3">
                <li>
                  <Link href="/recruitment" className="text-sm text-[#666666] transition-colors hover:text-[#1a1a1a]">
                    모집안내
                  </Link>
                </li>
                <li>
                  <Link href="/faq" className="text-sm text-[#666666] transition-colors hover:text-[#1a1a1a]">
                    FAQ
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-semibold text-[#1a1a1a]">소식</h4>
              <ul className="space-y-3">
                <li>
                  <Link href="/notices" className="text-sm text-[#666666] transition-colors hover:text-[#1a1a1a]">
                    공지사항
                  </Link>
                </li>
                <li>
                  <Link href="/press" className="text-sm text-[#666666] transition-colors hover:text-[#1a1a1a]">
                    언론보도
                  </Link>
                </li>
                <li>
                  <Link href="/gallery" className="text-sm text-[#666666] transition-colors hover:text-[#1a1a1a]">
                    갤러리
                  </Link>
                </li>
                <li>
                  <a
                    href="https://instagram.com/hra_official_"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-[#666666] transition-colors hover:text-[#1a1a1a]"
                  >
                    <span>@hra_official_</span>
                  </a>
                </li>
                <li>
                  <Link href="/faq" className="flex items-center gap-2 text-sm text-[#666666] transition-colors hover:text-[#1a1a1a]">
                    <Mail className="h-4 w-4" />
                    <span>문의</span>
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-semibold text-[#1a1a1a]">커뮤니티</h4>
              <ul className="space-y-3">
                <li>
                  <Link href="/cohorts" className="text-sm text-[#666666] transition-colors hover:text-[#1a1a1a]">
                    기수
                  </Link>
                </li>
                <li>
                  <Link href="/alumni" className="text-sm text-[#666666] transition-colors hover:text-[#1a1a1a]">
                    수료생 이야기
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="border-t border-[#D9D9D9] py-6 text-center text-sm text-[#999999]">
          © 2026 Human Renaissance Academy. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
