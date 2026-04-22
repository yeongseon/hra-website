import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  let dbStatus = "not_checked";
  let status = "ok";
  let httpStatus = 200;

  if (!process.env.DATABASE_URL) {
    dbStatus = "unavailable";
    status = "error";
    httpStatus = 503;
  } else {
    try {
      await db.execute(sql`SELECT 1`);
      dbStatus = "connected";
    } catch (error) {
      console.error("[api/health] DB 연결 오류:", error);
      dbStatus = "unavailable";
      status = "error";
      httpStatus = 503;
    }
  }

  return NextResponse.json(
    {
      status,
      database: dbStatus,
      timestamp: new Date().toISOString(),
    },
    { status: httpStatus }
  );
}
