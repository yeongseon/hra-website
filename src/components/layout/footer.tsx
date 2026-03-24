/**
 * 푸터 컴포넌트 - 사이트 하단 영역
 *
 * 이 컴포넌트는 HRA 웹사이트의 맨 아래에 표시되는 푸터를 만듭니다.
 * - HRA 소개 및 설명 (좌측)
 * - 사이트 주요 페이지 링크 (중앙)
 * - 연락처 정보 (우측)
 * - 저작권 표시
 *
 * 참고: 이 컴포넌트는 "use client"가 없으므로 서버 컴포넌트입니다.
 * 서버 컴포넌트는 상호작용이 없고 정보만 표시할 때 사용합니다.
 */

import Link from "next/link";

export function Footer() {
   return (
     <footer className="border-t border-white/10 bg-black py-12">
       <div className="mx-auto max-w-7xl px-6">
         {/* 
           푸터 콘텐츠: 3열 그리드 레이아웃
           - 첫 번째 열: HRA 소개
           - 두 번째 열: 주요 페이지 바로가기 링크
           - 세 번째 열: 연락처 정보
           - 모바일에서는 1열, 데스크톱에서는 3열로 표시
         */}
         <div className="grid gap-8 md:grid-cols-3">
           {/* 첫 번째 열: 조직 소개 정보 */}
           <div>
            <h3 className="text-lg font-bold text-white">HRA</h3>
            <p className="mt-2 text-sm text-gray-400">
              Human Renaissance Academy
            </p>
            <p className="mt-1 text-sm text-gray-500">
              인간 르네상스를 꿈꾸는 대학 연합 교육 프로그램
             </p>
           </div>

           {/* 두 번째 열: 사이트 주요 페이지 링크 */}
           <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
              바로가기
            </h4>
            <ul className="mt-4 space-y-2">
              <li>
                <Link
                  href="/about"
                  className="text-sm text-gray-500 transition-colors hover:text-white"
                >
                  소개
                </Link>
              </li>
              <li>
                <Link
                  href="/recruitment"
                  className="text-sm text-gray-500 transition-colors hover:text-white"
                >
                  모집안내
                </Link>
              </li>
              <li>
                <Link
                  href="/notices"
                  className="text-sm text-gray-500 transition-colors hover:text-white"
                >
                  공지사항
                </Link>
              </li>
             </ul>
           </div>

           {/* 세 번째 열: 연락처 정보 */}
           <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
              연락처
            </h4>
            <ul className="mt-4 space-y-2">
              <li className="text-sm text-gray-500">hra@example.com</li>
              <li>
                <a
                  href="https://instagram.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-500 transition-colors hover:text-white"
                >
                  Instagram
                </a>
              </li>
            </ul>
          </div>
         </div>

         {/* 
           하단 구분선 및 저작권 표시
           현재 연도를 동적으로 계산하여 항상 최신 연도 표시
         */}
         <div className="mt-8 border-t border-white/10 pt-8 text-center text-xs text-gray-600">
          © {new Date().getFullYear()} Human Renaissance Academy. All rights
          reserved.
        </div>
      </div>
    </footer>
  );
}
