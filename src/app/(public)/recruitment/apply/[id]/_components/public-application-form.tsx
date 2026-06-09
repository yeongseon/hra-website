/**
 * 사용자용 동적 지원서 작성 컴포넌트
 */
"use client";

import { useActionState } from "react";
import { CheckCircle2, AlertCircle, Send } from "lucide-react";
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
import { submitApplicationForm } from "@/features/applications/actions/submissions";

type Option = {
  id: string;
  value: string;
};

type Question = {
  id: string;
  title: string;
  description: string | null;
  type: "SHORT_ANSWER" | "LONG_ANSWER" | "MULTIPLE_CHOICE" | "CHECKBOX" | "DROPDOWN";
  isRequired: boolean;
  options: Option[];
};

type PublicApplicationFormProps = {
  form: {
    id: string;
    title: string;
    description: string | null;
  };
  questions: Question[];
};

const initialState = {
  success: false,
  message: "",
};

export function PublicApplicationForm({ form, questions }: PublicApplicationFormProps) {
  const [state, action, isPending] = useActionState(submitApplicationForm, initialState);

  if (state.success) {
    return (
      <div className="py-20 text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="mx-auto size-20 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 className="size-10 text-emerald-600" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-900">{state.message}</h2>
          <p className="text-slate-500">제출해주신 내용은 운영진이 검토 후 연락드리겠습니다.</p>
        </div>
        <Button variant="outline" className="mt-8" onClick={() => window.location.href = '/'}>
          홈으로 돌아가기
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-12">
      <input type="hidden" name="formId" value={form.id} />

      {/* 기본 정보 섹션 */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-blue-600 rounded-full" />
          <h2 className="text-xl font-bold text-slate-900">기본 정보</h2>
        </div>
        
        <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
          <CardContent className="p-6 sm:p-8 space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="applicantName" className="text-sm font-semibold">
                  이름 <span className="text-red-500">*</span>
                </Label>
                <Input 
                  id="applicantName" 
                  name="applicantName" 
                  placeholder="성함을 입력해주세요" 
                  required 
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="applicantEmail" className="text-sm font-semibold">
                  이메일 주소 <span className="text-red-500">*</span>
                </Label>
                <Input 
                  id="applicantEmail" 
                  name="applicantEmail" 
                  type="email" 
                  placeholder="example@email.com" 
                  required 
                  className="h-11"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="applicantPhone" className="text-sm font-semibold">
                연락처
              </Label>
              <Input 
                id="applicantPhone" 
                name="applicantPhone" 
                placeholder="010-0000-0000" 
                className="h-11"
              />
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

        <div className="space-y-6">
          {questions.map((q) => (
            <Card key={q.id} className="border-slate-200 shadow-sm overflow-hidden bg-white">
              <CardContent className="p-6 sm:p-8 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-base font-bold text-slate-900 leading-relaxed">
                    {q.title} {q.isRequired && <span className="text-red-500 ml-0.5">*</span>}
                  </Label>
                  {q.description && (
                    <p className="text-sm text-slate-500 leading-relaxed">{q.description}</p>
                  )}
                </div>

                <div className="pt-2">
                  {/* 단답형 */}
                  {q.type === "SHORT_ANSWER" && (
                    <Input 
                      name={`q-${q.id}`} 
                      placeholder="답변을 입력하세요" 
                      required={q.isRequired} 
                      className="h-11"
                    />
                  )}

                  {/* 장문형 */}
                  {q.type === "LONG_ANSWER" && (
                    <Textarea 
                      name={`q-${q.id}`} 
                      placeholder="답변을 상세히 입력해주세요" 
                      required={q.isRequired} 
                      className="min-h-[160px] resize-none leading-relaxed"
                    />
                  )}

                  {/* 객관식 (라디오) */}
                  {q.type === "MULTIPLE_CHOICE" && (
                    <RadioGroup name={`q-${q.id}`} required={q.isRequired} className="space-y-3">
                      {q.options.map((opt) => (
                        <div key={opt.id} className="flex items-center space-x-3 bg-slate-50 p-3 rounded-lg border border-transparent hover:border-slate-200 transition-colors">
                          <RadioGroupItem value={opt.value} id={`opt-${opt.id}`} />
                          <Label htmlFor={`opt-${opt.id}`} className="flex-1 cursor-pointer font-medium text-slate-700">
                            {opt.value}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}

                  {/* 드롭다운 */}
                  {q.type === "DROPDOWN" && (
                    <Select name={`q-${q.id}`} required={q.isRequired}>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="선택해주세요" />
                      </SelectTrigger>
                      <SelectContent>
                        {q.options.map((opt) => (
                          <SelectItem key={opt.id} value={opt.value}>
                            {opt.value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* 체크박스 */}
                  {q.type === "CHECKBOX" && (
                    <div className="space-y-3">
                      {q.options.map((opt) => (
                        <div key={opt.id} className="flex items-center space-x-3 bg-slate-50 p-3 rounded-lg border border-transparent hover:border-slate-200 transition-colors">
                          <Checkbox 
                            id={`opt-${opt.id}`} 
                            name={`q-${q.id}`} 
                            value={opt.value}
                          />
                          <Label htmlFor={`opt-${opt.id}`} className="flex-1 cursor-pointer font-medium text-slate-700">
                            {opt.value}
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
      </section>

      {/* 제출 버튼 및 메시지 */}
      <div className="pt-6 space-y-6">
        {state.message && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 animate-in fade-in zoom-in-95">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p className="font-medium">{state.message}</p>
          </div>
        )}

        <div className="flex flex-col items-center gap-4">
          <Button 
            type="submit" 
            disabled={isPending}
            className="w-full sm:w-auto sm:px-12 py-7 text-lg font-bold bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-600/20 rounded-2xl transition-all hover:scale-[1.02] active:scale-95"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                제출 중...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                지원서 제출하기
                <Send className="size-5" />
              </span>
            )}
          </Button>
          <p className="text-sm text-slate-400">
            제출 후에는 수정이 불가능하므로 다시 한번 확인 부탁드립니다.
          </p>
        </div>
      </div>
    </form>
  );
}
