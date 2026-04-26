/**
 * 지원서 작성 페이지 - /recruitment/apply
 *
 * 이 페이지는 비회원 사용자가 HRA 프로그램에 지원서를 작성하고 제출하는 곳입니다.
 * 페이지 흐름:
 * 1. URL의 쿼리 파라미터에서 기수 ID를 읽습니다 (?cohort=id)
 * 2. 사용자가 폼에 정보를 입력합니다
 * 3. 폼을 제출하면 서버 액션(submitApplication)이 실행됩니다
 * 4. 데이터베이스에 저장되고 결과 메시지가 표시됩니다
 *
 * "use client" = 이 페이지는 클라이언트 컴포넌트입니다.
 * 폼 입력이나 상태 관리를 위해 브라우저에서 실행되어야 합니다.
 * 하지만 폼 제출(submitApplication)은 서버에서 실행됩니다.
 */
"use client";

import { useActionState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  submitApplication,
  type SubmitApplicationState,
} from "@/features/applications/actions/submit";

/**
 * 초기 폼 상태
 * success: 지원서 제출 성공 여부
 * message: 사용자에게 보여줄 메시지 (성공/실패 메시지)
 */
const initialState: SubmitApplicationState = {
  success: false,
  message: "",
};

function ApplyForm() {
  /**
   * useSearchParams: 브라우저 URL의 쿼리 파라미터를 읽는 훅
   * 예: /recruitment/apply?cohort=123 -> searchParams.get("cohort") = "123"
   * 이를 통해 어느 기수에 지원하는지 파악합니다.
   */
  const searchParams = useSearchParams();
  const cohortId = searchParams.get("cohort") ?? "";
  
  /**
   * useActionState: Server Action을 관리하는 훅
   * 
   * 반환 값:
   * - state: 서버 액션의 현재 상태 (success, message)
   * - formAction: 폼의 action으로 사용할 함수 (폼 제출 시 자동으로 호출)
   * - isPending: 서버 액션이 진행 중인지 여부 (로딩 상태)
   * 
   * 이 훅이 있으면 polyfill 없이도 Server Action을 사용할 수 있습니다.
   */
  const [state, formAction, isPending] = useActionState(submitApplication, initialState);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <section className="mb-8 sm:mb-10 space-y-4">
        <Badge
          variant="outline"
          className="border-emerald-300 bg-emerald-50 text-emerald-700"
        >
          비회원 지원
        </Badge>
        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-[#1a1a1a]">
          지원서 작성
        </h1>
        <p className="max-w-2xl text-sm text-[#666666] md:text-base">
          비회원 지원 페이지입니다. 필수 정보를 정확히 작성해 제출해주세요.
        </p>
      </section>

      <Card className="border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] rounded-2xl py-0">
        <CardHeader className="border-b border-[#D9D9D9] py-6">
          <CardTitle className="text-xl text-[#1a1a1a] md:text-2xl">지원 정보 입력</CardTitle>
        </CardHeader>
        <CardContent className="py-6">
           {/* 폼 시작: action={formAction}으로 Server Action 연결 */}
            <form action={formAction} className="space-y-5">
              {/* 기수 ID를 숨겨진 입력 필드로 전달합니다 */}
              <input type="hidden" name="cohortId" value={cohortId} />

              <div
                className="absolute opacity-0 pointer-events-none"
                style={{ position: "absolute", left: "-9999px" }}
                aria-hidden="true"
              >
                <input type="text" name="website" tabIndex={-1} autoComplete="off" />
              </div>

              {!cohortId ? (
                 <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                   모집 기수 정보가 없습니다. 모집안내 페이지에서 다시 접근해주세요.
                 </div>
             ) : null}

             {/* 
               제출 결과 메시지: state.message가 있으면 표시합니다.
               성공/실패에 따라 다른 색상의 박스를 보여줍니다.
             */}
             {state.message ? (
               <div
                 className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
                    state.success
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-red-300 bg-red-50 text-red-700"
                  }`}
                >
                 {/* 성공하면 체크 아이콘, 실패하면 경고 아이콘 표시 */}
                 {state.success ? (
                  <CheckCircle2 className="mt-0.5 size-4" />
                ) : (
                  <AlertCircle className="mt-0.5 size-4" />
                )}
                <span>{state.message}</span>
              </div>
            ) : null}

             <div className="grid gap-5 md:grid-cols-2">
               {/* 이름 입력 필드 (필수) */}
               <div className="space-y-2">
                  <Label htmlFor="name" className="text-[#1a1a1a]">
                    이름
                  </Label>
                  <Input id="name" name="name" required className="h-10 border-[#D9D9D9] bg-white text-[#1a1a1a]" />
                </div>
               {/* 이메일 입력 필드 (필수) */}
               <div className="space-y-2">
                  <Label htmlFor="email" className="text-[#1a1a1a]">
                    이메일
                  </Label>
                 <Input
                   id="email"
                   name="email"
                   type="email"
                   required
                    className="h-10 border-[#D9D9D9] bg-white text-[#1a1a1a]"
                  />
                </div>
               {/* 전화번호 입력 필드 (선택) */}
               <div className="space-y-2">
                  <Label htmlFor="phone" className="text-[#1a1a1a]">
                    전화번호
                  </Label>
                  <Input id="phone" name="phone" className="h-10 border-[#D9D9D9] bg-white text-[#1a1a1a]" />
                </div>
               {/* 대학교 입력 필드 (선택) */}
               <div className="space-y-2">
                  <Label htmlFor="university" className="text-[#1a1a1a]">
                    대학교
                  </Label>
                 <Input
                   id="university"
                   name="university"
                    className="h-10 border-[#D9D9D9] bg-white text-[#1a1a1a]"
                  />
                </div>
               {/* 전공 입력 필드 (선택, 2열 차지) */}
               <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="major" className="text-[#1a1a1a]">
                    전공
                  </Label>
                  <Input id="major" name="major" className="h-10 border-[#D9D9D9] bg-white text-[#1a1a1a]" />
                </div>
               {/* 지원 동기 입력 필드 (필수, 긴 텍스트, 2열 차지) */}
               <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="motivation" className="text-[#1a1a1a]">
                    지원 동기
                  </Label>
                 <Textarea
                   id="motivation"
                   name="motivation"
                   required
                    className="min-h-36 border-[#D9D9D9] bg-white text-[#1a1a1a]"
                  />
                </div>
               {/* 추가 정보 입력 필드 (선택, 텍스트 영역, 2열 차지) */}
               <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="additionalInfo" className="text-[#1a1a1a]">
                    추가 정보
                  </Label>
                 <Textarea
                   id="additionalInfo"
                   name="additionalInfo"
                    className="min-h-28 border-[#D9D9D9] bg-white text-[#1a1a1a]"
                  />
                </div>
             </div>

             <Button
               type="submit"
               disabled={!cohortId || isPending || state.success}
                className="h-10 border border-blue-600 bg-white text-blue-600 hover:bg-blue-50"
              >
               {/* 
                 제출 상태에 따라 버튼 텍스트 변경
                 - isPending: 제출 중 (서버 요청 진행 중)
                 - state.success: 제출 완료 (성공)
                 - 기본: 지원서 제출
               */}
               {isPending ? "제출 중..." : state.success ? "제출 완료" : "지원서 제출"}
             </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function RecruitmentApplyPage() {
  /**
   * Suspense 컴포넌트로 감싸는 이유:
   * - useSearchParams는 클라이언트 컴포넌트에서만 작동하므로
   *   서버에서 렌더링할 때 에러가 발생할 수 있습니다.
   * - Suspense의 fallback으로 로딩 상태를 먼저 보여주고,
   *   클라이언트에서 로드될 때까지 기다립니다.
   */
  return (
    <Suspense
      fallback={
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-20 text-center text-[#666666]">
            로딩 중...
          </div>
      }
    >
      <ApplyForm />
    </Suspense>
  );
}
