import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logServerError } from "@/lib/errors";

const authProxy = auth(() => {
  return NextResponse.next();
});

export default async function proxy(
  ...args: Parameters<typeof authProxy>
) {
  try {
    return await authProxy(...args);
  } catch (error) {
    const [request] = args;
    logServerError("proxy/auth", error);
    return NextResponse.redirect(new URL("/system-error", request.url));
  }
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/resources/:path*",
    "/member/:path*",
    "/mypage/:path*",
  ],
};
