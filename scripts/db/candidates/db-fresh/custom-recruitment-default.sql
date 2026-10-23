-- #280 소유 로컬 fresh 후보: 모집 설정의 필수 고정 키 행만 준비합니다.
-- 원본 권위: scripts/migrate-recruitment-singleton.mjs:51
-- 검토 원본 SHA256: 5c1506e71ed1e4ab6d992a3fc8bab10acfc2e2b2064ab59857d20d96e2079e92
-- reviewedDelta: 원본의 미수식 recruitment_settings를 public.recruitment_settings로만 지정합니다.
-- 스키마 제약은 현재 Drizzle export가 소유하며 관리자 콘텐츠·지원 URL을 생성하지 않습니다.
-- 이 행은 합성 신규 설치의 기준이며 기존 운영 적용 이력이나 운영 승인이 아닙니다.
INSERT INTO public.recruitment_settings (singleton_key) VALUES (1)
ON CONFLICT (singleton_key) DO NOTHING;
