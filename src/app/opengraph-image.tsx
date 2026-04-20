/**
 * 사이트 전역 Open Graph 이미지 (1200x630 PNG).
 *
 * Next.js 16 의 파일 컨벤션에 따라 이 파일이 존재하면 자동으로
 * `<meta property="og:image">` 와 `<meta name="twitter:image">` 가 생성됩니다.
 * 카카오톡, 페이스북, 슬랙, 트위터 등에서 링크 공유 시 미리보기 카드로 사용됩니다.
 *
 * 별도 디자인 파일 없이 ImageResponse(JSX → PNG) 로 즉석 렌더링하므로
 * 사이트 카피/디자인 토큰만 바꾸면 미리보기도 함께 갱신됩니다.
 */
import { ImageResponse } from "next/og";

export const alt = "HRA - Human Renaissance Academy";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "96px",
          background:
            "linear-gradient(135deg, #1e3a8a 0%, #2563EB 55%, #3b82f6 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 36,
            fontWeight: 600,
            letterSpacing: "0.2em",
            opacity: 0.85,
            marginBottom: 24,
          }}
        >
          HRA
        </div>
        <div
          style={{
            fontSize: 84,
            fontWeight: 800,
            lineHeight: 1.1,
            marginBottom: 32,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span>Human Renaissance</span>
          <span>Academy</span>
        </div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 500,
            opacity: 0.95,
            lineHeight: 1.4,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span>인간 르네상스를 꿈꾸는</span>
          <span>대학 연합 교육 프로그램</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
