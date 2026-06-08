/**
 * 동적 지원서 질문 빌더 컴포넌트
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { 
  Plus, 
  Trash2, 
  GripVertical, 
  Settings2, 
  ChevronUp, 
  ChevronDown,
  Save
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
import { Separator } from "@/components/ui/separator";
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
  initialQuestions: Question[];
};

export function FormBuilder({ formId, initialQuestions }: FormBuilderProps) {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>(
    initialQuestions.length > 0 
      ? initialQuestions.sort((a, b) => a.order - b.order) 
      : []
  );
  const [isPending, startTransition] = useTransition();

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
    console.log("handleSave 호출 - questions:", questions);
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
      console.log("saveFormQuestions 결과:", result);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-slate-900">질문 항목 편집</h2>
        <Button 
          onClick={handleSave} 
          disabled={isPending}
          className="bg-slate-900 hover:bg-slate-700"
        >
          <Save className="mr-2 size-4" />
          {isPending ? "저장 중..." : "전체 저장"}
        </Button>
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
                    onValueChange={(v: any) => updateQuestion(qIndex, { type: v })}
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
  );
}
