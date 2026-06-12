/**
 * 동적 지원서 질문 빌더 컴포넌트
 * 미리보기 버튼을 누르면 실제 지원자 화면(createPortal 전체화면)을 즉시 확인할 수 있음
 */
"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  GripVertical,
  Settings2,
  ChevronUp,
  ChevronDown,
  Save,
  Eye,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { saveFormQuestions } from "@/features/applications/actions/questions";

type Option = {
  id?: string;
  value: string;
  order: number;
};

type Question = {
  id?: string;
  title: string;
  description: string | null;
  type: "SHORT_ANSWER" | "LONG_ANSWER" | "MULTIPLE_CHOICE" | "CHECKBOX" | "DROPDOWN";
  isRequired: boolean;
  order: number;
  options: Option[];
};

type FormBuilderProps = {
  formId: string;
  formTitle?: string;
  initialQuestions: Question[];
};

export function FormBuilder({ formId, formTitle, initialQuestions }: FormBuilderProps) {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>(
    initialQuestions.length > 0
      ? initialQuestions.sort((a, b) => a.order - b.order)
      : []
  );
  const [isPending, startTransition] = useTransition();
  // showPreview 초깃값이 false이므로 SSR 중에는 createPortal이 실행되지 않아 별도 mounted 가드 불필요
  const [showPreview, setShowPreview] = useState(false);

  // 질문 추가
  const addQuestion = () => {
    const newQuestion: Question = {
      title: "",
      description: "",
      type: "SHORT_ANSWER",
      isRequired: false,
      order: questions.length,
      options: [],
    };
    setQuestions([...questions, newQuestion]);
  };

  // 질문 삭제
  const removeQuestion = (index: number) => {
    const newQuestions = questions.filter((_, i) => i !== index);
    // 순서 재조정
    const reordered = newQuestions.map((q, i) => ({ ...q, order: i }));
    setQuestions(reordered);
  };

  // 질문 속성 변경
  const updateQuestion = (index: number, updates: Partial<Question>) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], ...updates };
    setQuestions(newQuestions);
  };

  // 질문 순서 변경 (위로)
  const moveUp = (index: number) => {
    if (index === 0) return;
    const newQuestions = [...questions];
    const temp = newQuestions[index - 1];
    newQuestions[index - 1] = { ...newQuestions[index], order: index - 1 };
    newQuestions[index] = { ...temp, order: index };
    setQuestions(newQuestions);
  };

  // 질문 순서 변경 (아래로)
  const moveDown = (index: number) => {
    if (index === questions.length - 1) return;
    const newQuestions = [...questions];
    const temp = newQuestions[index + 1];
    newQuestions[index + 1] = { ...newQuestions[index], order: index + 1 };
    newQuestions[index] = { ...temp, order: index };
    setQuestions(newQuestions);
  };

  // 선택지 추가
  const addOption = (qIndex: number) => {
    const question = questions[qIndex];
    const newOption: Option = {
      value: "",
      order: question.options.length,
    };
    updateQuestion(qIndex, {
      options: [...question.options, newOption],
    });
  };

  // 선택지 삭제
  const removeOption = (qIndex: number, optIndex: number) => {
    const question = questions[qIndex];
    const newOptions = question.options.filter((_, i) => i !== optIndex);
    updateQuestion(qIndex, {
      options: newOptions.map((opt, i) => ({ ...opt, order: i })),
    });
  };

  // 선택지 값 변경
  const updateOption = (qIndex: number, optIndex: number, value: string) => {
    const question = questions[qIndex];
    const newOptions = [...question.options];
    newOptions[optIndex] = { ...newOptions[optIndex], value };
    updateQuestion(qIndex, { options: newOptions });
  };

  // 최종 저장
  const handleSave = () => {
    if (questions.length === 0) {
      toast.error("최소 하나 이상의 질문을 추가해주세요.");
      return;
    }

    // 간단한 검증: 제목이 비어있는 질문이 있는지
    if (questions.some(q => !q.title.trim())) {
      toast.error("모든 질문의 제목을 입력해주세요.");
      return;
    }

    startTransition(async () => {
      const result = await saveFormQuestions(formId, questions);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-slate-900">질문 항목 편집</h2>
        <div className="flex items-center gap-2">
          {/* 지원자 화면 미리보기 버튼 */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowPreview(true)}
            className="border-[#D9D9D9] text-[#1a1a1a] hover:bg-gray-50"
          >
            <Eye className="mr-2 size-4" />
            지원자 화면 미리보기
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending}
            className="bg-slate-900 hover:bg-slate-700"
          >
            <Save className="mr-2 size-4" />
            {isPending ? "저장 중..." : "전체 저장"}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {questions.map((q, qIndex) => (
          <Card key={qIndex} className="border-slate-200 shadow-sm overflow-hidden group">
            <div className="bg-slate-50 px-4 py-2 flex items-center justify-between border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200">
                  Q{qIndex + 1}
                </span>
                <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                  {q.type.replace("_", " ")}
                </span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="size-8" onClick={() => moveUp(qIndex)} disabled={qIndex === 0}>
                  <ChevronUp className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" className="size-8" onClick={() => moveDown(qIndex)} disabled={qIndex === questions.length - 1}>
                  <ChevronDown className="size-4" />
                </Button>
                <Separator orientation="vertical" className="h-4 mx-1" />
                <Button variant="ghost" size="icon" className="size-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => removeQuestion(qIndex)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
            <CardContent className="p-5 space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="md:col-span-3 space-y-2">
                  <Label className="text-xs text-slate-500">질문 제목</Label>
                  <Input 
                    value={q.title} 
                    onChange={(e) => updateQuestion(qIndex, { title: e.target.value })}
                    placeholder="질문 내용을 입력하세요"
                    className="h-10 border-slate-200 focus:border-slate-400 focus:ring-0"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">질문 유형</Label>
                  <Select
                    value={q.type}
                    onValueChange={(v: "SHORT_ANSWER" | "LONG_ANSWER" | "MULTIPLE_CHOICE" | "CHECKBOX" | "DROPDOWN" | null) => v && updateQuestion(qIndex, { type: v })}
                    items={{ SHORT_ANSWER: "단답형", LONG_ANSWER: "장문형", MULTIPLE_CHOICE: "객관식 (택 1)", CHECKBOX: "체크박스 (다중 선택)", DROPDOWN: "드롭다운" }}
                  >
                    <SelectTrigger className="h-10 border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SHORT_ANSWER">단답형</SelectItem>
                      <SelectItem value="LONG_ANSWER">장문형</SelectItem>
                      <SelectItem value="MULTIPLE_CHOICE">객관식 (택 1)</SelectItem>
                      <SelectItem value="CHECKBOX">체크박스 (다중 선택)</SelectItem>
                      <SelectItem value="DROPDOWN">드롭다운</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-500">질문 설명 (선택 사항)</Label>
                <Textarea 
                  value={q.description || ""} 
                  onChange={(e) => updateQuestion(qIndex, { description: e.target.value })}

                  placeholder="질문에 대한 추가 설명이나 힌트를 입력하세요"
                  className="resize-none border-slate-200 focus:border-slate-400 focus:ring-0 min-h-[80px]"
                />
              </div>

              <div className="flex items-center gap-6 py-1">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id={`required-${qIndex}`} 
                    checked={q.isRequired}
                    onCheckedChange={(checked: boolean) => updateQuestion(qIndex, { isRequired: !!checked })}
                  />
                  <Label htmlFor={`required-${qIndex}`} className="text-sm font-medium cursor-pointer">필수 응답</Label>
                </div>
              </div>

              {/* 선택지 영역 (객관식 등일 때만 표시) */}
              {["MULTIPLE_CHOICE", "CHECKBOX", "DROPDOWN"].includes(q.type) && (
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <Label className="text-xs font-semibold text-slate-700 flex items-center gap-2">
                    <Settings2 className="size-3.5" />
                    선택지 구성
                  </Label>
                  <div className="space-y-2 ml-1">
                    {q.options.map((opt, optIndex) => (
                      <div key={optIndex} className="flex items-center gap-2">
                        <GripVertical className="size-4 text-slate-300" />
                        <Input 
                          value={opt.value}
                          onChange={(e) => updateOption(qIndex, optIndex, e.target.value)}
                          placeholder={`옵션 ${optIndex + 1}`}
                          className="h-9 text-sm border-slate-200"
                        />
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="size-9 shrink-0 text-slate-400 hover:text-red-500"
                          onClick={() => removeOption(qIndex, optIndex)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full h-9 border-dashed border-slate-300 text-slate-500 hover:text-slate-900 mt-1"
                      onClick={() => addOption(qIndex)}
                    >
                      <Plus className="mr-1 size-3.5" />
                      옵션 추가
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {questions.length === 0 && (
          <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
            <Plus className="size-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">아직 추가된 질문이 없습니다.</p>
            <p className="text-slate-400 text-sm">아래 버튼을 눌러 첫 번째 질문을 만들어보세요.</p>
          </div>
        )}

        <Button 
          variant="outline" 
          className="w-full py-8 border-dashed border-2 border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-all rounded-2xl flex flex-col gap-2"
          onClick={addQuestion}
        >
          <div className="size-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-slate-200">
            <Plus className="size-6" />
          </div>
          <span className="font-semibold text-slate-600">질문 추가하기</span>
        </Button>
      </div>

      <div className="pt-4 flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isPending}
          className="bg-slate-900 hover:bg-slate-700 px-8 py-6 rounded-xl shadow-lg"
        >
          <Save className="mr-2 size-5" />
          <span className="text-base">{isPending ? "저장 중..." : "전체 질문 저장하기"}</span>
        </Button>
      </div>
    </div>

    {/* 지원자 화면 미리보기 — createPortal로 document.body에 마운트 */}
    {showPreview && createPortal(
      <div className="fixed inset-0 z-[9999] flex flex-col overflow-hidden bg-gray-50">
        {/* 미리보기 상단 바 */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#D9D9D9] bg-white px-4 py-2.5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#2563EB]" />
            <span className="text-xs font-medium text-[#666666]">
              미리보기 — 지원자가 보는 실제 화면
            </span>
            <Badge variant="outline" className="ml-2 border-amber-300 bg-amber-50 text-amber-700 text-[10px]">
              저장되지 않은 변경사항도 반영됩니다
            </Badge>
          </div>
          <button
            type="button"
            onClick={() => setShowPreview(false)}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-[#1a1a1a] transition-colors hover:bg-gray-100"
          >
            <X className="size-4" />
            편집으로 돌아가기
          </button>
        </div>

        {/* 미리보기 본문 — 실제 PublicApplicationApplyPage 레이아웃과 동일 */}
        <div className="flex-1 overflow-y-auto bg-[#F8FAFC]">
          <div className="mx-auto max-w-4xl px-4 py-12 sm:py-20 md:py-32">
            {/* 헤더 섹션 */}
            <section className="mb-12 space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700 px-3 py-1 font-bold">
                  온라인 지원
                </Badge>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
                {formTitle ?? "지원서 양식"}
              </h1>
            </section>

            {/* 기본 정보 섹션 (고정 문항) */}
            <section className="space-y-6 mb-12">
              <div className="flex items-center gap-3">
                <div className="w-1 h-6 bg-blue-600 rounded-full" />
                <h2 className="text-xl font-bold text-slate-900">기본 정보</h2>
              </div>
              <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
                <CardContent className="p-6 sm:p-8 space-y-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">
                        이름 <span className="text-red-500">*</span>
                      </Label>
                      <Input placeholder="성함을 입력해주세요" className="h-11" disabled />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">
                        이메일 주소 <span className="text-red-500">*</span>
                      </Label>
                      <Input placeholder="example@email.com" className="h-11" disabled />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">
                      연락처 <span className="text-red-500">*</span>
                    </Label>
                    <Input placeholder="010-0000-0000" className="h-11" disabled />
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* 동적 질문 섹션 */}
            <section className="space-y-8">
              <div className="flex items-center gap-3">
                <div className="w-1 h-6 bg-blue-600 rounded-full" />
                <h2 className="text-xl font-bold text-slate-900">지원 상세 내용</h2>
              </div>

              {questions.length === 0 ? (
                <div className="py-20 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                  아직 추가된 질문이 없습니다. 편집 화면에서 질문을 추가하세요.
                </div>
              ) : (
                <div className="space-y-6">
                  {questions.map((q, index) => (
                    <Card key={index} className="border-slate-200 shadow-sm overflow-hidden bg-white">
                      <CardContent className="p-6 sm:p-8 space-y-4">
                        <div className="space-y-1.5">
                          <Label className="text-base font-bold text-slate-900 leading-relaxed">
                            {q.title || <span className="italic text-slate-400">질문 제목 없음</span>}
                            {q.isRequired && <span className="text-red-500 ml-0.5">*</span>}
                          </Label>
                          {q.description && (
                            <p className="text-sm text-slate-500 leading-relaxed">{q.description}</p>
                          )}
                        </div>

                        <div className="pt-2">
                          {q.type === "SHORT_ANSWER" && (
                            <Input placeholder="답변을 입력하세요" className="h-11" disabled />
                          )}
                          {q.type === "LONG_ANSWER" && (
                            <Textarea placeholder="답변을 상세히 입력해주세요" className="min-h-[160px] resize-none leading-relaxed" disabled />
                          )}
                          {q.type === "MULTIPLE_CHOICE" && (
                            <RadioGroup className="space-y-3">
                              {q.options.length === 0 ? (
                                <p className="text-sm text-slate-400 italic">선택지가 없습니다.</p>
                              ) : q.options.map((opt, optIndex) => (
                                <div key={optIndex} className="flex items-center space-x-3 bg-slate-50 p-3 rounded-lg border border-transparent">
                                  <RadioGroupItem value={opt.value} id={`preview-opt-${index}-${optIndex}`} disabled />
                                  <Label htmlFor={`preview-opt-${index}-${optIndex}`} className="flex-1 font-medium text-slate-700">
                                    {opt.value || <span className="italic text-slate-400">옵션 텍스트 없음</span>}
                                  </Label>
                                </div>
                              ))}
                            </RadioGroup>
                          )}
                          {q.type === "DROPDOWN" && (
                            <Select disabled>
                              <SelectTrigger className="h-11">
                                <SelectValue placeholder="선택해주세요" />
                              </SelectTrigger>
                              <SelectContent>
                                {q.options.map((opt, optIndex) => (
                                  <SelectItem key={optIndex} value={opt.value || `opt-${optIndex}`}>
                                    {opt.value || `옵션 ${optIndex + 1}`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          {q.type === "CHECKBOX" && (
                            <div className="space-y-3">
                              {q.options.length === 0 ? (
                                <p className="text-sm text-slate-400 italic">선택지가 없습니다.</p>
                              ) : q.options.map((opt, optIndex) => (
                                <div key={optIndex} className="flex items-center space-x-3 bg-slate-50 p-3 rounded-lg border border-transparent">
                                  <Checkbox id={`preview-chk-${index}-${optIndex}`} disabled />
                                  <Label htmlFor={`preview-chk-${index}-${optIndex}`} className="flex-1 font-medium text-slate-700">
                                    {opt.value || <span className="italic text-slate-400">옵션 텍스트 없음</span>}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {/* 제출 버튼 (비활성화 — 미리보기용) */}
            <div className="pt-12 flex flex-col items-center gap-4">
              <Button
                disabled
                className="w-full sm:w-auto sm:px-12 py-7 text-lg font-bold bg-blue-600 rounded-2xl opacity-50 cursor-not-allowed"
              >
                지원서 제출하기
              </Button>
              <p className="text-sm text-slate-400">미리보기 화면에서는 제출이 비활성화됩니다.</p>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}
