import Link from "next/link";
import { asc } from "drizzle-orm";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteAlumniStory } from "@/features/alumni/actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { alumniStories } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

function truncateText(value: string | null, maxLength = 50) {
  if (!value) {
    return "-";
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

export default async function AdminAlumniPage() {
  await requireAdmin();

  const stories = await db
    .select()
    .from(alumniStories)
    .orderBy(asc(alumniStories.order), asc(alumniStories.createdAt));

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a]">수료생 이야기 관리</h1>
        <Button className="bg-[#1a1a1a] text-white hover:bg-[#333333]" render={<Link href="/admin/alumni/new" />}>
          <Plus className="mr-1 size-4" />
          새 수료생 이야기 추가
        </Button>
      </div>

      <Card className="border-[#D9D9D9] bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-[#D9D9D9] py-4">
          <CardTitle className="text-base text-[#1a1a1a]">전체 수료생 이야기 {stories.length}건</CardTitle>
        </CardHeader>
        <CardContent className="py-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>제목</TableHead>
                  <TableHead>메인노출</TableHead>
                  <TableHead>인용구</TableHead>
                  <TableHead>순서</TableHead>
                  <TableHead>액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-[#666666]">
                      등록된 수료생 이야기가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  stories.map((story) => (
                    <TableRow key={story.id}>
                      <TableCell className="font-medium text-[#1a1a1a]">{story.name}</TableCell>
                      <TableCell className="text-[#1a1a1a]">{story.title ?? "-"}</TableCell>
                      <TableCell className="text-[#666666]">{story.isFeatured ? "노출" : "숨김"}</TableCell>
                      <TableCell className="max-w-xs text-[#666666]">{truncateText(story.quote, 60)}</TableCell>
                      <TableCell className="text-[#666666]">{story.order}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" render={<Link href={`/admin/alumni/${story.id}`} />}>
                            편집
                          </Button>
                          <form action={deleteAlumniStory.bind(null, story.id)}>
                            <Button type="submit" variant="destructive" size="sm">
                              삭제
                            </Button>
                          </form>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
