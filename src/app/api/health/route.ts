import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const envCheck = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    AUTH_SECRET: !!process.env.AUTH_SECRET,
    BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
    NEXT_PUBLIC_APP_URL: !!process.env.NEXT_PUBLIC_APP_URL,
    GITHUB_TOKEN: !!process.env.GITHUB_TOKEN,
    GITHUB_REPO: !!process.env.GITHUB_REPO,
    GOOGLE_SHEETS_API_KEY: !!process.env.GOOGLE_SHEETS_API_KEY,
  };

  let dbStatus = "not_checked";
  let status = "ok";
  let httpStatus = 200;

  if (!process.env.DATABASE_URL) {
    dbStatus = "DATABASE_URL not set";
    status = "error";
    httpStatus = 503;
  } else {
    try {
      await db.execute(sql`SELECT 1`);
      dbStatus = "connected";
    } catch (error) {
      console.error("[api/health] DB 연결 오류:", error);
      dbStatus = error instanceof Error ? error.message : "unknown error";
      status = "error";
      httpStatus = 503;
    }
  }

  return NextResponse.json(
    { status, database: dbStatus, env: envCheck, timestamp: new Date().toISOString() },
    { status: httpStatus }
  );
}
