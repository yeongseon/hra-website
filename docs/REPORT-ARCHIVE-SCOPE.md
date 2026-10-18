# 보고서 양식·가이드의 현재 경로

회원 자료실이나 관리자 양식 화면을 수정하는 개발자를 위한 안내입니다. **양식의 목록·상세·인쇄 화면**과 **학생의 개인 과제 제출**은 서로 다른 기능입니다.

2026-10-18 기준으로 페이지와 `src/lib/markdown/resolve.ts`를 대조했습니다. 기본 저장 방식의 결정 배경은 [저장 방식 결정](REPORT-STORAGE-DECISION.md)을 참고하세요.

## 회원 화면

모든 경로에서 회원 인가를 확인합니다. Proxy만으로 보호한다고 가정하지 않고 페이지·조회 계층의 확인도 유지합니다.

| URL | 현재 동작 | 데이터 또는 다음 경로 |
| --- | --- | --- |
| `/resources` | 자료실과 보고서 양식의 진입점 | 자료 종류별 데이터와 양식 조회 |
| `/member/templates` | 이전 링크를 위한 이동 경로 | 회원 확인 후 `/resources`로 redirect |
| `/member/templates/[slug]` | 양식 상세 미리보기 | `resolveTemplate(slug)` |
| `/member/templates/[slug]/print` | 양식을 인쇄하거나 PDF로 저장 | 같은 양식 조회, 인쇄용 화면 |
| `/member/guides/[slug]` | 작성·Markdown·제출 안내 | `resolveGuide(slug)` |

`slug`는 URL에서 항목을 구분하는 이름입니다. 예를 들어 경영서 양식은 `management-book`을 사용합니다. 양식 인쇄는 현재 표시한 양식의 PDF를 만드는 기능이며 학생의 작성본 저장·과제 제출을 자동으로 수행하지 않습니다.

## 내장 항목 이름

| 종류 | slug | 내용 |
| --- | --- | --- |
| 양식 | `management-book` | 경영서 |
| 양식 | `classic-book` | 고전명작 |
| 양식 | `business-practice` | 기업실무·한국경제사 |
| 가이드 | `report-writing-guide` | 보고서 작성 안내 |
| 가이드 | `markdown-guide` | Markdown 문법 |
| 가이드 | `submission-guide` | 보고서 준비·제출 안내 |

## 관리자 화면

| URL | 작업 |
| --- | --- |
| `/admin/resources/templates` | 양식·가이드 목록과 비공개 처리 |
| `/admin/resources/templates/new` | 새 항목 등록 |
| `/admin/resources/templates/[id]/edit` | 내용·공개 여부 수정 |

관련 서버 액션은 `src/features/report-templates/actions/index.ts`입니다. 각 쓰기 진입점은 `requireAdmin()`으로 홈페이지 관리자 권한을 확인합니다.

`category=template`이면 보고서 분야를 선택합니다. `category=guide`이면 분야는 저장하지 않습니다. 화면의 “비공개”는 DB 행을 남겨 `published=false`로 바꾸는 작업입니다.

## DB와 내장 기본본의 선택

1. 같은 slug·종류의 DB 항목을 찾습니다.
2. DB 항목이 공개 상태면 그 내용을 보여 줍니다.
3. DB 항목이 비공개면 숨기며 내장 기본본도 대신 보여 주지 않습니다.
4. DB 항목 자체가 없을 때만 `content/member/`의 기본본을 읽습니다.

이 동작은 “DB 연결 실패 시 무조건 내장 파일로 복구”라는 뜻이 아닙니다. 운영 양식은 관리자 화면에서 수정하고, 기본본을 바꾸는 PR이 기존 DB 내용을 덮어쓰지 않는다는 점을 확인합니다.

## 변경 후 확인

- 목록에서 고른 양식의 상세와 인쇄 내용이 같은지 확인합니다.
- 비공개로 전환한 DB 항목이 내장 기본본으로 다시 보이지 않는지 확인합니다.
- 이전 `/member/templates` 링크가 회원 인가를 거쳐 자료실로 이동하는지 확인합니다.
- 학생 개인 제출을 수정하는 작업이면 [과제 제출 범위](ASSIGNMENT-SUBMISSION-SCOPE.md)의 별도 정책·검증을 따릅니다.

