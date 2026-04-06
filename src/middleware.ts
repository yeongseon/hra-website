import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const authMiddleware = auth((req) => {
  return NextResponse.next();
});

export default async function middleware(
  ...args: Parameters<typeof authMiddleware>
) {
  try {
    return await authMiddleware(...args);
  } catch (error) {
    const [request] = args;
    console.error("[middleware] 인증 확인 실패:", error);
    return NextResponse.redirect(new URL("/system-error", request.url));
  }
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/resources/:path*",
    "/mypage/:path*",
  ],
};
