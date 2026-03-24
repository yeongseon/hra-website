import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black py-12">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <h3 className="text-lg font-bold text-white">HRA</h3>
            <p className="mt-2 text-sm text-gray-400">
              Human Renaissance Academy
            </p>
            <p className="mt-1 text-sm text-gray-500">
              인간 르네상스를 꿈꾸는 대학 연합 교육 프로그램
            </p>
          </div>

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

        <div className="mt-8 border-t border-white/10 pt-8 text-center text-xs text-gray-600">
          © {new Date().getFullYear()} Human Renaissance Academy. All rights
          reserved.
        </div>
      </div>
    </footer>
  );
}
