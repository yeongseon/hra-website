"use client";

// 갤러리 이미지 드래그앤드롭 그리드 컴포넌트 (앨범 편집 페이지 전용)
// HTML5 Drag and Drop API를 사용하여 앨범 내 이미지 순서를 변경합니다.
// 드롭 시 reorderGalleryImages 서버 액션을 호출해 DB에 순서를 저장합니다.

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { AlertCircle, GripVertical, ImageIcon, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteGalleryImage, reorderGalleryImages } from "@/features/gallery/actions";
import { cn } from "@/lib/utils";

type GalleryImageItem = {
  id: string;
  url: string;
  alt: string | null;
  order: number;
};

type Props = {
  galleryId: string;
  coverImageUrl: string | null;
  initialImages: GalleryImageItem[];
};

export function GalleryImageSortableGrid({ galleryId, coverImageUrl, initialImages }: Props) {
  const [images, setImages] = useState(initialImages);
  // ref: 드롭 핸들러에서 동기적으로 읽기 위한 드래그 인덱스
  const draggingIdxRef = useRef<number | null>(null);
  // state: 드래그 중인 카드에 opacity 효과를 주기 위한 시각 전용 인덱스
  const [draggingVisualIdx, setDraggingVisualIdx] = useState<number | null>(null);
  // 드래그 커서가 위에 올라와 있는 카드의 인덱스 (드롭 대상 강조용)
  const [overIdx, setOverIdx] = useState<number | null>(null);
  // 서버 저장 상태
  const [isPending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  // 드래그 시작
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, idx: number) => {
    draggingIdxRef.current = idx;
    setDraggingVisualIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };

  // 드래그 중 타겟 카드 위 이동
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, idx: number) => {
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

  // 드롭 — 이미지 위치를 변경하고 서버에 저장
  const handleDrop = (e: React.DragEvent<HTMLDivElement>, dropIdx: number) => {
    e.preventDefault();
    const fromIdx = draggingIdxRef.current;

    draggingIdxRef.current = null;
    setDraggingVisualIdx(null);
    setOverIdx(null);

    if (fromIdx === null || fromIdx === dropIdx) return;

    // 낙관적 UI: 먼저 로컬 상태 갱신
    const prev = images;
    const next = [...images];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(dropIdx, 0, moved);
    setImages(next);

    setSaveError(null);
    startTransition(async () => {
      const result = await reorderGalleryImages(galleryId, next.map((i) => i.id));
      if (!result.success) {
        // 저장 실패 시 이전 상태로 복원
        setSaveError(result.message);
        setImages(prev);
      }
    });
  };

  // 삭제 — 낙관적으로 로컬 상태에서 제거 후 서버 액션 호출
  const handleDelete = async (imageId: string) => {
    if (!confirm("이미지를 삭제하시겠습니까?")) return;
    setImages((prev) => prev.filter((i) => i.id !== imageId));
    await deleteGalleryImage(galleryId, imageId);
  };

  if (images.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
        아직 등록된 이미지가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {saveError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertCircle className="size-4 shrink-0" />
          {saveError}
        </div>
      )}
      {isPending && (
        <p className="text-xs text-slate-500">순서 저장 중...</p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {images.map((image, idx) => (
          <div
            key={image.id}
            draggable
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
            onDrop={(e) => handleDrop(e, idx)}
            className={cn(
              "overflow-hidden rounded-xl border bg-white shadow-sm transition-all",
              draggingVisualIdx === idx
                ? "cursor-grabbing opacity-40 border-slate-200"
                : "cursor-grab border-slate-200",
              overIdx === idx && "border-blue-400 ring-2 ring-blue-300"
            )}
          >
            <div className="relative h-44 w-full bg-slate-100">
              {image.url ? (
                <Image
                  src={image.url}
                  alt={image.alt ?? "갤러리 이미지"}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  <ImageIcon className="size-8" />
                </div>
              )}

              {/* 커버 이미지 배지 */}
              {coverImageUrl === image.url && (
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-1 text-xs font-medium text-white">
                  <Star className="size-3" />
                  커버
                </span>
              )}

              {/* 드래그 핸들 배지 */}
              <span className="absolute right-2 top-2 inline-flex items-center rounded-full bg-white/80 p-1 text-slate-500 shadow-sm">
                <GripVertical className="size-4" />
              </span>

              {/* 순서 번호 */}
              <span className="absolute bottom-2 left-2 inline-flex items-center rounded-full bg-black/50 px-2 py-0.5 text-xs font-medium text-white">
                {idx + 1}
              </span>
            </div>

            <div className="space-y-3 p-4 text-sm text-slate-600">
              <p className="line-clamp-2 min-h-10 break-all">{image.alt || "(대체 텍스트 없음)"}</p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await handleDelete(image.id);
                }}
              >
                <Button type="submit" variant="destructive" className="w-full">
                  <Trash2 className="mr-1 size-4" />이미지 삭제
                </Button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
