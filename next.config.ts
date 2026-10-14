/**
 * ======================================================
 * Next.js 프레임워크 설정 파일
 * ======================================================
 * 
 * Next.js 프레임워크의 동작 방식을 커스터마이징하는 파일입니다.
 * 여기서 설정할 수 있는 것들:
 * 
 * - 이미지 로딩할 때 사용 가능한 도메인 설정
 * - URL 리다이렉트 규칙 (옛날 주소 → 새로운 주소)
 * - 환경변수 설정
 * - 빌드 최적화 옵션
 * - 웹팩 설정 (고급)
 * 
 * 현재는 기본 설정만 사용 중이므로, 필요한 것이 생기면 여기에 추가하면 됩니다.
 * 예를 들어, 외부 이미지를 사용하면 domains 배열에 도메인을 등록해야 합니다.
 */

import type { NextConfig } from "next";
import { projectBlobHost } from "./src/lib/blob-host";

// 실행에 영향이 적은 CSP 지시어부터 강제하고, 리소스 출처 제한은 보고 모드로 관찰한다.
const enforcedCsp = "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'";
const reportOnlyCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  `img-src 'self' data: blob: https://${projectBlobHost}`,
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self' https://view.officeapps.live.com",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: enforcedCsp },
          { key: "Content-Security-Policy-Report-Only", value: reportOnlyCsp },
        ],
      },
      {
        // PDF는 같은 출처의 자료실 페이지에만 임베드합니다.
        source: "/api/resources/:kind/:id/download",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: enforcedCsp.replace("frame-ancestors 'none'", "frame-ancestors 'self'") },
        ],
      },
    ];
  },
  experimental: {
    // 가이드북·주차별텍스트 파일 업로드 최대 30MB + 멀티파트 헤더 여유분 포함해 32MB로 설정.
    // 기본값(1MB)에서는 대부분의 파일이 413 에러로 차단된다.
    serverActions: {
      bodySizeLimit: "32mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: projectBlobHost,
      },
    ],
  },
};

export default nextConfig;
