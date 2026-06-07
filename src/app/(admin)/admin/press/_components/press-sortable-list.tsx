"use client";

// 언론보도 드래그앤드롭 목록 컴포넌트 (관리자 전용)
// HTML5 Drag and Drop API를 사용하여 언론보도 표시 순서를 변경합니다.
// 드롭 시 reorderPressArticles 서버 액션을 호출해 DB에 순서를 저장합니다.

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertCircle, GripVertical, Trash2 } from "lucide-react";
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
import { deletePressArticle, reorderPressArticles } from "@/features/press/actions";
import { cn } from "@/lib/utils";

type PressArticleRow = {
  id: string;
  title: string;
  source: string;
  publishedAt: Date;
};

type Props = {
  initialItems: PressArticleRow[];
};

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

export function PressSortableList({ initialItems }: Props) {
  const [items, setItems] = useState(initialItems);
  // ref: 드롭 핸들러에서 동기적으로 읽기 위한 드래그 인덱스
  const draggingIdxRef = useRef<number | null>(null);
  // state: 드래그 중인 행에 opacity 효과를 주기 위한 시각 전용 인덱스
  const [draggingVisualIdx, setDraggingVisualIdx] = useState<number | null>(null);
  // 드래그 커서가 위에 올라와 있는 항목의 인덱스 (드롭 대상 강조용)
  const [overIdx, setOverIdx] = useState<number | null>(null);
  // 서버 저장 상태
  const [isPending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  // 드래그 시작 — ref(드롭 로직용) + state(시각 효과용) 모두 갱신
  const handleDragStart = (e: React.DragEvent<HTMLTableRowElement>, idx: number) => {
    draggingIdxRef.current = idx;
    setDraggingVisualIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };

  // 드래그 중 타겟 위 이동 — 브라우저 기본 금지 동작 해제 + 강조 인덱스 갱신
  const handleDragOver = (e: React.DragEvent<HTMLTableRowElement>, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggingIdxRef.current !== null && draggingIdxRef.current !== idx) {
      setOverIdx(idx);
    }
  };

  // 드래그 종료 (드롭 없이 취소 포함)
  const handleDragEnd = () => {
    draggingIdxRef.current = null;
    setDraggingVisualIdx(null);
    setOverIdx(null);
  };

  // 드롭 — 항목 위치를 변경하고 서버에 저장
  const handleDrop = (e: React.DragEvent<HTMLTableRowElement>, dropIdx: number) => {
    e.preventDefault();
    const fromIdx = draggingIdxRef.current;

    draggingIdxRef.current = null;
    setDraggingVisualIdx(null);
    setOverIdx(null);

    // 같은 위치에 드롭하면 변경 없음
    if (fromIdx === null || fromIdx === dropIdx) return;

    // 낙관적 UI: 먼저 로컬 상태 갱신
    const prev = items;
    const next = [...items];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(dropIdx, 0, moved);
    setItems(next);

    setSaveError(null);
    startTransition(async () => {
      const result = await reorderPressArticles(next.map((i) => i.id));
      if (!result.success) {
        // 저장 실패 시 이전 상태로 복원
        setSaveError(result.message);
        setItems(prev);
      }
    });
  };

  // 삭제 — 낙관적으로 로컬 상태에서 제거 후 서버 액션 호출
  const handleDelete = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    await deletePressArticle(id);
  };

  return (
    <Card className="border-[#D9D9D9] bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-[#D9D9D9] py-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base text-[#1a1a1a]">전체 언론보도 {items.length}건</CardTitle>
          {isPending && (
            <span className="text-xs text-[#666666]">순서 저장 중...</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="py-4">
        {saveError && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            <AlertCircle className="size-4 shrink-0" />
            {saveError}
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {/* 드래그 핸들 열 */}
                <TableHead className="w-10" />
                <TableHead className="w-10 text-center">순서</TableHead>
                <TableHead>제목</TableHead>
                <TableHead>언론사</TableHead>
                <TableHead>게시일</TableHead>
                <TableHead className="w-32 shrink-0">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-[#666666]">
                    등록된 언론보도가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item, idx) => (
                  <TableRow
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, idx)}
                    className={cn(
                      "transition-colors",
                      // 드래그 중인 행: 반투명
                      draggingVisualIdx === idx && "opacity-40",
                      // 드롭 대상 행: 파란색 배경 강조
                      overIdx === idx && "bg-blue-50 outline outline-2 -outline-offset-1 outline-blue-300"
                    )}
                  >
                    {/* 드래그 핸들 */}
                    <TableCell className="cursor-grab px-2 text-[#D9D9D9] active:cursor-grabbing">
                      <GripVertical className="size-4" />
                    </TableCell>
                    {/* 현재 배열 위치 기반 순서 번호 */}
                    <TableCell className="text-center text-[#666666]">{idx + 1}</TableCell>
                    <TableCell className="max-w-sm font-medium text-[#1a1a1a]">
                      {truncate(item.title, 70)}
                    </TableCell>
                    <TableCell className="text-[#1a1a1a]">{truncate(item.source, 30)}</TableCell>
                    <TableCell className="text-[#666666]">{formatDate(item.publishedAt)}</TableCell>
                    <TableCell className="w-32">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          render={<Link href={`/admin/press/${item.id}`} />}
                        >
                          수정
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(item.id)}
                        >
                          <Trash2 className="size-3.5" />
                          삭제
                        </Button>
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
  );
}
