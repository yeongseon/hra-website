/**
 * 일정 등록/수정 폼 컴포넌트
 *
 * 역할: 일정(이벤트) 생성 및 수정 UI
 * 사용 위치:
 *   - /admin/schedule/new (새 일정 등록)
 *   - /admin/schedule/[id] (기존 일정 수정)
 *
 * 핵심 동작:
 *   - 이벤트 유형(CLASS/EVENT)에 따라 세션 슬롯 섹션 표시/숨김
 *   - 세션 슬롯은 동적으로 추가/삭제 가능
 *   - 카테고리가 CASE_STUDY일 때 subTitle, subDescription 추가 필드 표시
 *   - 세션 배열은 JSON 직렬화 후 hidden input "sessionsJson"으로 서버에 전달
 */

"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ScheduleActionState } from "@/features/schedule/actions";
import type { Faculty, Cohort } from "@/lib/db/schema";

// 세션 카테고리 선택지
const categoryOptions = [
  { value: "CLASSICS", label: "고전 읽기" },
  { value: "ENGLISH", label: "영어" },
  { value: "SPEECH", label: "스피치 특강" },
  { value: "SPECIAL_LECTURE", label: "특강" },
  { value: "CASE_STUDY", label: "케이스스터디" },
] as const;

type SessionCategory = (typeof categoryOptions)[number]["value"];

// 세션 카테고리 → 교수 카테고리 매핑
// (faculty 테이블의 category: CLASSICS | BUSINESS | LECTURE)
const sessionToFacultyCategory: Record<SessionCategory, "CLASSICS" | "BUSINESS" | "LECTURE"> = {
  CLASSICS: "CLASSICS",
  CASE_STUDY: "BUSINESS",
  ENGLISH: "LECTURE",
  SPEECH: "LECTURE",
  SPECIAL_LECTURE: "LECTURE",
};

// 세션 슬롯 데이터 타입
type SessionSlot = {
  id: string; // 클라이언트 식별용 임시 키 (DB ID 아님)
  category: SessionCategory;
  facultyId: string | null;
  content: string;
  reportCategory: string; // 케이스스터디 분야 (경영서/고전명작/기업실무·한국경제사)
  subTitle: string;       // 케이스스터디 제목
  subDescription: string; // 케이스스터디 설명
  order: number;
};

// 기존 이벤트의 세션 데이터 타입 (수정 폼 defaultValues용)
type DefaultSession = {
  category: SessionCategory;
  facultyId: string | null;
  content: string | null;
  reportCategory: string | null;
  subTitle: string | null;
  subDescription: string | null;
  order: number;
};

type DefaultValues = {
  eventDate?: string;       // "YYYY-MM-DD" 형식 (날짜만)
  startTime?: string;       // "HH:MM" 형식 (시작 시간)
  endTime?: string | null;  // "HH:MM" 형식 (종료 시간, 선택)
  eventType?: "CLASS" | "EVENT";
  title?: string;
  cohortId?: string | null;
  weekNumber?: number | null;
  description?: string | null;
  isPublic?: boolean;
  sessions?: DefaultSession[];
};

type ScheduleFormProps = {
  title: string;
  submitLabel: string;
  action: (prevState: ScheduleActionState, formData: FormData) => Promise<ScheduleActionState>;
  defaultValues?: DefaultValues;
  faculties: Faculty[];
  cohorts: Cohort[];
};

const initialState: ScheduleActionState = {
  success: false,
  message: "",
};

// 새 빈 세션 슬롯 생성
function createEmptySession(order: number): SessionSlot {
  return {
    id: `session-${Date.now()}-${Math.random()}`,
    category: "CLASSICS",
    facultyId: null,
    content: "",
    reportCategory: "",
    subTitle: "",
    subDescription: "",
    order,
  };
}

export function ScheduleForm({
  title,
  submitLabel,
  action,
  defaultValues,
  faculties,
  cohorts,
}: ScheduleFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  // 이벤트 유형 상태 (CLASS이면 세션 섹션 표시)
  const [eventType, setEventType] = useState<"CLASS" | "EVENT">(
    defaultValues?.eventType ?? "CLASS"
  );

  // 세션 슬롯 목록 상태
  const [sessions, setSessions] = useState<SessionSlot[]>(() => {
    if (!defaultValues?.sessions || defaultValues.sessions.length === 0) {
      // 신규 등록 기본값: 고전명작·영어·케이스스터디 3개 슬롯
      return [
        createEmptySession(0),
        { ...createEmptySession(1), category: "ENGLISH" },
        { ...createEmptySession(2), category: "CASE_STUDY" },
      ];
    }
    // 수정 폼: 기존 세션 데이터로 초기화
    return defaultValues.sessions.map((s, i) => ({
      id: `session-existing-${i}`,
      category: s.category,
      facultyId: s.facultyId ?? null,
      content: s.content ?? "",
      reportCategory: s.reportCategory ?? "",
      subTitle: s.subTitle ?? "",
      subDescription: s.subDescription ?? "",
      order: s.order,
    }));
  });

  // 세션 필드 업데이트
  function updateSession(id: string, field: keyof SessionSlot, value: string | null | number) {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  }

  // 세션 추가
  function addSession() {
    setSessions((prev) => [...prev, createEmptySession(prev.length)]);
  }

  // 세션 삭제
  function removeSession(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i })));
  }

  // 세션 순서 위로 이동
  function moveSessionUp(index: number) {
    if (index === 0) return;
    setSessions((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next.map((s, i) => ({ ...s, order: i }));
    });
  }

  // 세션 순서 아래로 이동
  function moveSessionDown(index: number) {
    setSessions((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next.map((s, i) => ({ ...s, order: i }));
    });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <Card className="border-[#D9D9D9] bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-[#D9D9D9] py-6">
          <CardTitle className="text-2xl font-semibold text-[#1a1a1a]">{title}</CardTitle>
        </CardHeader>
        <CardContent className="py-6">
          <form action={formAction} className="space-y-8">
            {/* 오류 메시지 */}
            {state.message && !state.success ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{state.message}</span>
              </div>
            ) : null}

            {/* sessionsJson hidden input — 세션 배열을 JSON으로 직렬화해서 서버에 전달 */}
            <input
              type="hidden"
              name="sessionsJson"
              value={JSON.stringify(sessions)}
            />

            {/* ── 기본 정보 섹션 ─────────────────────────────── */}
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-[#1a1a1a]">기본 정보</h2>

              <div className="grid gap-5 md:grid-cols-2">
                {/* 일정 유형 */}
                <div className="space-y-2">
                  <Label htmlFor="eventType" className="text-[#1a1a1a]">
                    일정 유형 <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    name="eventType"
                    value={eventType}
                    onValueChange={(v) => setEventType(v as "CLASS" | "EVENT")}
                    items={{ CLASS: "정기수업", EVENT: "행사" }}
                  >
                    <SelectTrigger id="eventType" className="h-10 w-full border-[#D9D9D9] bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CLASS">정기수업</SelectItem>
                      <SelectItem value="EVENT">행사</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 날짜 */}
                <div className="space-y-2">
                  <Label htmlFor="eventDate" className="text-[#1a1a1a]">
                    날짜 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="eventDate"
                    name="eventDate"
                    type="date"
                    required
                    defaultValue={defaultValues?.eventDate ?? ""}
                    className="h-10 border-[#D9D9D9]"
                  />
                  {state.fieldErrors?.eventDate ? (
                    <p className="text-xs text-red-600">{state.fieldErrors.eventDate}</p>
                  ) : null}
                </div>

                {/* 시작/종료 시간 */}
                <div className="space-y-2">
                  <Label className="text-[#1a1a1a]">
                    시간 <span className="text-red-500">*</span>
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      name="startTime"
                      type="time"
                      required
                      defaultValue={defaultValues?.startTime ?? ""}
                      className="h-10 border-[#D9D9D9] flex-1"
                    />
                    <span className="text-[#666666] shrink-0">~</span>
                    <Input
                      name="endTime"
                      type="time"
                      defaultValue={defaultValues?.endTime ?? ""}
                      className="h-10 border-[#D9D9D9] flex-1"
                    />
                  </div>
                  {state.fieldErrors?.startTime ? (
                    <p className="text-xs text-red-600">{state.fieldErrors.startTime}</p>
                  ) : null}
                </div>

                {/* 제목 */}
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="title" className="text-[#1a1a1a]">
                    제목 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="title"
                    name="title"
                    required
                    placeholder={eventType === "CLASS" ? "예: 5기 3주차 수업" : "예: 5기 수료식"}
                    defaultValue={defaultValues?.title ?? ""}
                    className="h-10 border-[#D9D9D9]"
                  />
                  {state.fieldErrors?.title ? (
                    <p className="text-xs text-red-600">{state.fieldErrors.title}</p>
                  ) : null}
                </div>

                {/* 관련 기수 */}
                <div className="space-y-2">
                  <Label htmlFor="cohortId" className="text-[#1a1a1a]">
                    관련 기수{eventType === "CLASS" ? <span className="text-red-500"> *</span> : null}
                  </Label>
                  <Select
                    name="cohortId"
                    defaultValue={defaultValues?.cohortId ?? ""}
                    items={[{ value: "", label: "선택 안 함" }, ...cohorts.map((c) => ({ value: c.id, label: c.name }))]}
                  >
                    <SelectTrigger id="cohortId" className="h-10 w-full border-[#D9D9D9] bg-white">
                      <SelectValue placeholder="기수 선택 (선택사항)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">선택 안 함</SelectItem>
                      {cohorts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 주차 (CLASS일 때만 표시) */}
                {eventType === "CLASS" ? (
                  <div className="space-y-2">
                    <Label htmlFor="weekNumber" className="text-[#1a1a1a]">주차</Label>
                    <Input
                      id="weekNumber"
                      name="weekNumber"
                      type="number"
                      min={1}
                      placeholder="예: 3"
                      defaultValue={defaultValues?.weekNumber ?? ""}
                      className="h-10 border-[#D9D9D9]"
                    />
                  </div>
                ) : null}

                {/* 비고 */}
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="description" className="text-[#1a1a1a]">비고</Label>
                  <Textarea
                    id="description"
                    name="description"
                    rows={2}
                    placeholder="추가 안내사항이 있으면 입력하세요."
                    defaultValue={defaultValues?.description ?? ""}
                    className="border-[#D9D9D9] resize-none"
                  />
                </div>

                {/* 공개 여부 */}
                <div className="flex items-center gap-2 md:col-span-2">
                  <Checkbox
                    id="isPublic"
                    name="isPublic"
                    defaultChecked={defaultValues?.isPublic ?? true}
                  />
                  <Label htmlFor="isPublic" className="cursor-pointer text-[#1a1a1a]">
                    메인 페이지에 공개
                  </Label>
                </div>
              </div>
            </div>

            {/* ── 세션 슬롯 섹션 (CLASS일 때만 표시) ─────────── */}
            {eventType === "CLASS" ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-t border-[#D9D9D9] pt-6">
                  <h2 className="text-base font-semibold text-[#1a1a1a]">
                    수업 세션 <span className="text-sm font-normal text-[#666666]">({sessions.length}개)</span>
                  </h2>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addSession}
                    className="gap-1.5 border-[#D9D9D9]"
                  >
                    <Plus className="size-4" />
                    세션 추가
                  </Button>
                </div>

                {sessions.length === 0 ? (
                  <p className="py-4 text-center text-sm text-[#666666]">세션을 추가해주세요.</p>
                ) : (
                  <div className="space-y-4">
                    {sessions.map((session, index) => (
                      <div
                        key={session.id}
                        className="rounded-xl border border-[#D9D9D9] bg-[#FAFAFA] p-4 space-y-4"
                      >
                        {/* 세션 헤더: 카테고리 + 순서 이동 + 삭제 */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[#666666] w-6 text-center">
                            {index + 1}
                          </span>

                          {/* 카테고리 선택 — 변경 시 교수 카테고리가 달라지면 교수 선택 초기화 */}
                          <Select
                            value={session.category}
                            onValueChange={(v) => {
                              const newCat = v as SessionCategory;
                              const newFacultyCat = sessionToFacultyCategory[newCat];
                              const currentFaculty = faculties.find((f) => f.id === session.facultyId);
                              setSessions((prev) =>
                                prev.map((s) =>
                                  s.id === session.id
                                    ? {
                                        ...s,
                                        category: newCat,
                                        facultyId:
                                          currentFaculty && currentFaculty.category !== newFacultyCat
                                            ? null
                                            : s.facultyId,
                                      }
                                    : s
                                )
                              );
                            }}
                            items={categoryOptions}
                          >
                            <SelectTrigger className="h-9 w-[160px] border-[#D9D9D9] bg-white text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {categoryOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* 담당 교수/강사 선택 — 세션 카테고리에 맞는 교수진만 표시 */}
                          {(() => {
                            const filteredFaculties = faculties.filter(
                              (f) => f.category === sessionToFacultyCategory[session.category]
                            );
                            return (
                              <Select
                                value={session.facultyId ?? ""}
                                onValueChange={(v) =>
                                  updateSession(session.id, "facultyId", v === "" ? null : v)
                                }
                                items={[{ value: "", label: "선택 안 함" }, ...filteredFaculties.map((f) => ({ value: f.id, label: f.name }))]}
                              >
                                <SelectTrigger className="h-9 flex-1 border-[#D9D9D9] bg-white text-sm">
                                  <SelectValue placeholder="교수/강사 선택" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="">선택 안 함</SelectItem>
                                  {filteredFaculties.map((f) => (
                                    <SelectItem key={f.id} value={f.id}>
                                      {f.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            );
                          })()}

                          {/* 순서 이동 버튼 */}
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              disabled={index === 0}
                              onClick={() => moveSessionUp(index)}
                            >
                              <ChevronUp className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              disabled={index === sessions.length - 1}
                              onClick={() => moveSessionDown(index)}
                            >
                              <ChevronDown className="size-4" />
                            </Button>
                          </div>

                          {/* 삭제 버튼 */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-red-500 hover:bg-red-50 hover:text-red-600"
                            onClick={() => removeSession(session.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>

                        {/* 수업 내용 입력 */}
                        <div className="pl-8 space-y-3">
                          {/* 주요 내용 */}
                          <div className="space-y-1.5">
                            <Label className="text-xs text-[#666666]">
                              {session.category === "CLASSICS"
                                ? "읽은 책 (예: 도도의 노래, 상대성원리)"
                                : session.category === "CASE_STUDY"
                                  ? "경영서 제목"
                                  : "수업 주제"}
                            </Label>
                            <Input
                              value={session.content}
                              onChange={(e) => updateSession(session.id, "content", e.target.value)}
                              placeholder={
                                session.category === "CLASSICS"
                                  ? "예: 도도의 노래(데이비드 콰멘), 상대성원리(아인슈타인)"
                                  : session.category === "CASE_STUDY"
                                    ? "예: 도쿄 리테일 트랜드(정희선)"
                                    : "수업 주제를 입력하세요"
                              }
                              className="h-9 border-[#D9D9D9] bg-white text-sm"
                            />
                          </div>

                          {/* 케이스스터디 전용 추가 필드 */}
                          {session.category === "CASE_STUDY" ? (
                            <>
                              <div className="space-y-1.5">
                                <Label className="text-xs text-[#666666]">케이스스터디 제목</Label>
                                <Input
                                  value={session.subTitle}
                                  onChange={(e) => updateSession(session.id, "subTitle", e.target.value)}
                                  placeholder="예: 제주 상권 조사 및 임대차계약"
                                  className="h-9 border-[#D9D9D9] bg-white text-sm"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs text-[#666666]">케이스스터디 설명</Label>
                                <Textarea
                                  value={session.subDescription}
                                  onChange={(e) => updateSession(session.id, "subDescription", e.target.value)}
                                  rows={3}
                                  placeholder="과제 설명, 조건, 주의사항 등을 자세히 입력하세요."
                                  className="border-[#D9D9D9] bg-white text-sm resize-none"
                                />
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {/* 버튼 영역 */}
            <div className="flex items-center justify-end gap-2 border-t border-[#D9D9D9] pt-4">
              <Link
                href="/admin/schedule"
                className={buttonVariants({ variant: "outline" })}
              >
                취소
              </Link>
              <Button
                type="submit"
                disabled={isPending}
                className="bg-[#1a1a1a] text-white hover:bg-[#333333]"
              >
                {isPending ? "저장 중..." : submitLabel}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
