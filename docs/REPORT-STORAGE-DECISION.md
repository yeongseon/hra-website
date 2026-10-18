# 보고서 양식·가이드 저장 방식 결정

**결정**: 운영 데이터는 DB(Neon Postgres)를 단일 수정 지점으로 사용하고, `content/` 폴더는 초기 내장 양식 및 fallback baseline으로 유지한다.

**결정일**: 2026-04 · **코드 대조**: 2026-10-18

양식이 어디에서 오는지, 비공개 처리 후 무엇을 확인해야 하는지 알고 싶은 개발자를 위한 결정 기록이다. `fallback`은 DB에 해당 항목 자체가 없을 때 내장 기본본을 사용하는 동작이다. 현재 화면 경로는 [양식·가이드 경로](REPORT-ARCHIVE-SCOPE.md)를 따른다.
**관련 이슈**: #14, #18

---

## 배경

회원에게 제공하는 "보고서 양식(template)"과 "보고서 작성·제출 가이드(guide)"의 저장 방식을 결정해야 했다. HRA 사이트는 AGENTS.md §4 원칙에 따라 "관리자 페이지에서 CRUD하는 텍스트/메타는 DB, 이미지만 Blob"을 따른다.

## 검토한 대안

### 1안. DB 우선 + content fallback (채택)
- 운영 변경은 모두 `report_templates` 테이블에서 발생
- 관리자 페이지(`/admin/resources/templates`)에서 CRUD
- `content/member/templates/`, `content/member/guides/`는 **초기 내장(default) 양식**으로 유지한다. DB 연결과 스키마가 준비됐지만 해당 양식·가이드 행이 없을 때 기본 문서를 제공한다. DB 장애나 테이블 부재를 복구하는 대체 저장소는 아니다.

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
4. **회복력(fallback baseline)** — DB에 해당 slug row가 없는 경우에 한해 `content/` 내장 양식이 동작
5. **테스트 용이성** — content/ Markdown은 Vitest로 frontmatter/sanitize 회귀 검증

## 리졸버 정책

`src/lib/markdown/resolve.ts`의 동작:

```
resolveTemplate(slug) / resolveGuide(slug):
  1) 같은 slug의 DB row 존재 여부 확인 (published 무관)
     - 존재 + published=true  → DB 사용 (source: "db")
     - 존재 + published=false → null 반환 (회원 비노출, fallback 금지)
  2) DB row가 아예 없을 때만 content/ 내장 양식 사용 (source: "content")
  3) 둘 다 없으면 null → 404

listTemplates():
  - published=true 인 DB row만 회원 목록에 노출
  - 비공개(published=false) row의 slug는 content fallback 차단 집합에 포함
```

조회 결과의 `source` 값은 DB와 내장 기본본을 구분하는 데 사용한다. 현재 상세 화면에 출처 라벨이 있다고 가정하지 말고, 테스트에서 실제 선택한 내용과 비공개 시 반환 결과를 확인한다.

## 삭제/비공개 정책

운영자가 회원에게 노출하지 않으려는 양식은 **삭제가 아니라 비공개(`published=false`)** 로 처리한다.

이유: content/에 동일 slug의 내장 양식이 있을 때 DB row를 실제로 삭제하면, resolver가 content fallback 단계로 넘어가 회원 페이지에 동일 양식이 다시 표시된다("삭제했는데 다시 보임" 문제). DB row가 비공개 상태로 남아 있어야 resolver가 fallback을 차단할 수 있다.

관리자 UI(`/admin/resources/templates`)는 이를 반영해 행 액션을 "비공개"로 명시한다. 비공개로 전환된 항목은 수정 페이지에서 다시 공개로 되돌릴 수 있다. 영구 삭제가 필요한 경우(예: 관리자 실수로 만든 row, content 시드가 없는 사용자 정의 양식 정리)는 별도의 운영 작업으로 처리한다.

## 비채택 영향

- `content/member/templates/*.md`는 더 이상 회원 페이지의 1차 데이터 소스가 아님
- 운영 양식 변경은 반드시 `/admin/resources/templates`에서 진행
- content/ 내장 양식은 다음 경우에만 사용:
  - DB 스키마가 준비된 신규 환경에서 양식·가이드 행을 넣기 전 기본 문서 제공
  - 양식 회귀 테스트(Vitest)의 고정 입력

