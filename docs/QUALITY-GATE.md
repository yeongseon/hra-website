# 보고서 시스템 품질 게이트

이슈 #20 — 보고서 양식·가이드 기능 머지 전 통과해야 할 회귀 점검 목록.

## 자동 검증 (CI/CD)

다음 명령이 모두 성공해야 한다.

```bash
npm run lint
npx tsc --noEmit
npm run build
npm test
```

| 단계 | 기준 | 비고 |
|---|---|---|
| ESLint | 신규 코드 0 error / 0 warning | 사전 존재 경고는 별도 이슈로 |
| TypeScript | `tsc --noEmit` 0 error | `as any` / `@ts-ignore` 금지 |
| Next build | 빌드 성공 | `/admin/templates`, `/member/templates`, `/member/guides`, print 라우트 포함 |
| Vitest | 마크다운 단위 테스트 PASS | `tests/unit/markdown-*.test.ts` |

## 수동 점검 체크리스트

### DB 마이그레이션
- [ ] `npx drizzle-kit push` 실행 → `report_templates` 테이블 생성 확인
- [ ] `report_template_category` enum 생성 확인 (`template`, `guide`)

### 관리자 (`/admin/templates`)
- [ ] 신규 등록 — 양식(template, reportCategory 포함) / 가이드(guide, reportCategory null) 둘 다 정상 저장
- [ ] slug 중복 시 검증 메시지 노출
- [ ] 수정 — 본문/버전/published 토글 반영
- [ ] 삭제 다이얼로그 — 취소/확정 동작
- [ ] 미공개(`published=false`) 항목은 회원 페이지에 노출 안 됨

### 회원 (`/member/templates`, `/member/guides`)
- [ ] `/resources` 카드 3종 → 정상 라우팅
- [ ] DB에 항목이 있을 때 `source: db` 라벨 표시
- [ ] DB에 없을 때 content/ 시드로 fallback (`source: content`)
- [ ] 양식 상세에서 "PDF로 다운로드" → print 페이지 진입 후 `window.print()` 자동 호출
- [ ] 인쇄 시 A4 여백 적용, "다시 인쇄" 버튼은 화면에만 표시(no-print)

### 콘텐츠 검수
- [ ] 템플릿 3종 모두 장 번호 1.~5. (로마자 미사용)
- [ ] 1·2장 인라인 레이블이 `### 제목 / ### 그림 / ### 내용 / ### 출처` 소제목으로 승격됨
- [ ] 빈 장(3·4·5)은 양식 그대로 유지
- [ ] 가이드의 항목 기호 표가 공문서 표준(`1.→가.→1)→가)→(1)→(가)→①→㉮`)을 따름

## 사전 존재 LSP false-positive (무시 가능)

- `src/app/globals.css`: Tailwind v4 디렉티브를 LSP가 인식하지 못함
- `Cannot find module 'template-row-actions'` / `_print-view`: TS 서버 캐시 — 빌드/재시작 시 해소

## 머지 차단 사유

다음 중 하나라도 발생하면 머지 금지:

- `npm run build` 실패
- `tsc --noEmit` 에러
- 회원 페이지에서 양식·가이드 404 (DB·content 모두 누락)
- 인쇄 페이지에서 한글 깨짐 또는 페이지 분할 깨짐
