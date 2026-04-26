# 보고서 양식·가이드 저장 방식 결정

**결정**: DB(Neon Postgres) 단독 저장 + content/ 폴더는 초기 시드(seed)로만 유지

**결정일**: 2026-04
**관련 이슈**: #14, #18

---

## 배경

회원에게 제공하는 "보고서 양식(template)"과 "보고서 작성·제출 가이드(guide)"의 저장 방식을 결정해야 했다. HRA 사이트는 AGENTS.md §4 원칙에 따라 "관리자 페이지에서 CRUD하는 텍스트/메타는 DB, 이미지만 Blob"을 따른다.

## 검토한 대안

### 1안. DB 단독 저장 (채택)
- 모든 양식/가이드를 `report_templates` 테이블에 저장
- 관리자 페이지(`/admin/templates`)에서 CRUD
- `content/member/templates/`, `content/member/guides/`는 **초기 시드용** Markdown 파일만 유지

### 2안. content/ fs 단독 저장
- Markdown 파일을 git으로만 관리
- 관리자 CRUD 불가 → 코드 PR 필요

### 3안. DB + fs 동기화
- DB에 저장하되 git에도 동기화 커밋
- 단일 진실 공급원(single source of truth) 부재 → 충돌 위험

## 채택 사유

1. **AGENTS.md §4 원칙 일치** — 공지사항·언론보도·자료실과 동일한 패턴(DB 텍스트 + Blob 이미지)
2. **운영자 자율성** — 코드 PR 없이 관리자 페이지에서 즉시 양식 개정 가능
3. **버전 관리** — `version` 필드로 v1.0 / v1.1 등 명시적 추적
4. **회복력(seed)** — DB에 항목이 없거나 신규 환경 부트스트랩 시 `content/` 시드가 안전망 역할
5. **테스트 용이성** — content/ Markdown은 Vitest로 frontmatter/sanitize 회귀 검증

## 리졸버 정책

`src/lib/markdown/resolve.ts`의 동작:

```
resolveTemplate(slug) / resolveGuide(slug):
  1) DB에서 published=true 항목 조회 → 있으면 그것 사용 (source: "db")
  2) 없으면 content/ Markdown 시드 사용 (source: "content")
  3) 둘 다 없으면 null → 404
```

회원 UI에는 출처를 작은 라벨("DB 등록 양식" / "기본 시드 양식")로 표시해 디버깅을 돕는다.

## 비채택 영향

- `content/member/templates/*.md`는 더 이상 회원 페이지의 1차 데이터 소스가 아님
- 운영 양식 변경은 반드시 `/admin/templates`에서 진행
- content/ 시드는 다음 경우에만 사용:
  - 신규 환경에서 DB seed 전 임시 fallback
  - 양식 회귀 테스트(Vitest)의 고정 입력
