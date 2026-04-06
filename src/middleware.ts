import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

export default async function middleware(request: NextRequest) {
  try {
    const session = await auth();

    const { pathname } = request.nextUrl;

    if (pathname.startsWith("/admin")) {
      if (!session?.user || session.user.role !== "ADMIN") {
        return NextResponse.redirect(new URL("/login", request.url));
      }
    }

    if (pathname.startsWith("/resources") || pathname.startsWith("/mypage")) {
      if (!session?.user) {
        return NextResponse.redirect(new URL("/login", request.url));
      }
    }

    return NextResponse.next();
  } catch (error) {
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
