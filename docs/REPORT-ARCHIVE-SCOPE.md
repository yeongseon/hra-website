# 보고서 양식·가이드 라우팅 표

이슈 #18 — 회원 자료실에서 어떤 URL이 어떤 데이터를 보여주는지 한눈에 정리.

## 회원 영역 (로그인 필요)

| URL | 페이지 | 데이터 출처 | 비고 |
|---|---|---|---|
| `/resources` | 자료실 메인 (카드 3종) | 정적 | 양식·가이드 진입점 |
| `/member/templates` | 보고서 양식 목록 | `listTemplates()` (DB → content) | 분야별 v버전 카드 |
| `/member/templates/[slug]` | 양식 상세(웹 미리보기) | `resolveTemplate(slug)` | "PDF로 다운로드" CTA |
| `/member/templates/[slug]/print` | 양식 인쇄(PDF 저장) | `resolveTemplate(slug)` | A4 + auto `window.print()` |
| `/member/guides/[slug]` | 가이드 상세 | `resolveGuide(slug)` | 인쇄 페이지 없음 |

### 알려진 slug

**templates** (DB `category="template"`, `report_category` 부여):
- `management-book` — 경영서
- `classic-book` — 고전명작
- `business-practice` — 기업실무·한국경제사

**guides** (DB `category="guide"`, `report_category` 없음):
- `report-writing-guide` — 보고서 작성 가이드
- `markdown-guide` — Markdown 사용 가이드
- `submission-guide` — 보고서 제출 가이드

## 관리자 영역 (`requireAdmin()`)

| URL | 페이지 | 액션 |
|---|---|---|
| `/admin/templates` | 양식·가이드 목록 | 수정/삭제 다이얼로그 |
| `/admin/templates/new` | 신규 등록 | `createReportTemplate` |
| `/admin/templates/[id]/edit` | 수정 | `updateReportTemplate` |

폼 동작:
- `category="template"` 선택 시 `reportCategory` 필드 활성화
- `category="guide"` 선택 시 `reportCategory` 비활성화 (저장 시 null)

## 데이터 흐름

```
관리자 CRUD ──▶ report_templates 테이블 ──┐
                                          ├──▶ resolve.ts ──▶ 회원 페이지
content/member/{templates,guides}/*.md ───┘   (DB 우선, 없으면 content)
```

## 권한

- `(member)` 그룹: middleware (`src/proxy.ts`)에서 비로그인 차단
- `(admin)` 그룹: 각 server action에서 `requireAdmin()` 호출
