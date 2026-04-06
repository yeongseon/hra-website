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
import { Instagram, Mail } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-[#D9D9D9] bg-white py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900">HRA</h3>
            <p className="mt-2 text-sm text-gray-600">
              휴먼 르네상스 아카데미
            </p>
            <p className="mt-1 text-sm text-gray-500">
              인간 르네상스를 꿈꾸는 대학 연합 교육 프로그램
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-900">
              바로가기
            </h4>
            <ul className="mt-4 space-y-2">
              <li>
                <Link
                  href="/about"
                  className="text-sm text-gray-600 transition-colors hover:text-gray-900"
                >
                  HRA 소개
                </Link>
              </li>
              <li>
                <Link
                  href="/curriculum"
                  className="text-sm text-gray-600 transition-colors hover:text-gray-900"
                >
                  HRA 교육
                </Link>
              </li>
              <li>
                <Link
                  href="/cohorts"
                  className="text-sm text-gray-600 transition-colors hover:text-gray-900"
                >
                  기수 소개
                </Link>
              </li>
              <li>
                <Link
                  href="/gallery"
                  className="text-sm text-gray-600 transition-colors hover:text-gray-900"
                >
                  갤러리
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-900">
              연락처
            </h4>
            <ul className="mt-4 space-y-3">
              <li>
                <a
                  href="https://instagram.com/hra_official"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-gray-600 transition-colors hover:text-gray-900"
                >
                  <Instagram className="h-4 w-4" />
                  <span>인스타그램</span>
                </a>
              </li>
              <li className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="h-4 w-4" />
                <span>info@hra.ac.kr</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-[#D9D9D9] pt-8 text-center text-sm text-gray-500">
          © 2026 HRA. 모든 권리 보유.
        </div>
      </div>
    </footer>
  );
}
