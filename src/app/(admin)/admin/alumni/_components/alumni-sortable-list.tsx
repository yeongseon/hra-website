"use client";

// 수료생 이야기 관리 목록 컴포넌트 (관리자 전용)
// 작성일 최신순으로 표시하며, 고정 버튼으로 상단 고정을 토글한다.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteAlumniStory } from "@/features/alumni/actions";
import { AlumniPinButton } from "./alumni-pin-button";

type AlumniStoryRow = {
  id: string;
  name: string;
  quote: string;
  content: string;
  pinned: boolean;
};

type Props = {
  initialItems: AlumniStoryRow[];
};

// 마크다운 기호를 제거해 평문 미리보기로 변환
function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/[*_~>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// 삭제 확인 다이얼로그를 포함한 행 관리 버튼
function AlumniRowActions({ id }: { id: string }) {
  const router = useRouter();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-end gap-2">
      <Button variant="outline" size="sm" render={<Link href={`/admin/alumni/${id}`} />}>
        수정
      </Button>
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogTrigger render={<Button variant="destructive" size="sm" />}>
          <Trash2 className="size-3.5" />
          삭제
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>수료생 이야기를 삭제할까요?</DialogTitle>
            <DialogDescription>삭제 후에는 복구할 수 없습니다.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>취소</Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  await deleteAlumniStory(id);
                  setIsDeleteOpen(false);
                  router.refresh();
                });
              }}
            >
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AlumniSortableList({ initialItems }: Props) {
  return (
    <Card className="border-[#D9D9D9] bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-[#D9D9D9] py-4">
        <CardTitle className="text-base text-[#1a1a1a]">전체 수료생 이야기 {initialItems.length}건</CardTitle>
      </CardHeader>
      <CardContent className="py-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">고정</TableHead>
                <TableHead>대표 문구</TableHead>
                <TableHead>상세 이야기 내용</TableHead>
                <TableHead className="w-32">이름</TableHead>
                <TableHead className="w-32">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-[#666666]">
                    등록된 수료생 이야기가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                initialItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <AlumniPinButton id={item.id} pinned={item.pinned} />
                    </TableCell>
                    <TableCell className="w-[25%] max-w-0 font-medium text-[#1a1a1a]">
                      <span className="block overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,black_80%,transparent_100%)]">
                        {item.quote}
                      </span>
                    </TableCell>
                    <TableCell className="w-[35%] max-w-0 text-[#666666]">
                      <span className="block overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,black_75%,transparent_100%)]">
                        {stripMarkdown(item.content)}
                      </span>
                    </TableCell>
                    <TableCell className="text-[#1a1a1a]">{item.name}</TableCell>
                    <TableCell>
                      <AlumniRowActions id={item.id} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
