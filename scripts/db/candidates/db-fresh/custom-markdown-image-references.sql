-- 현재 저장된 콘텐츠와 서버 등록 이미지의 참조 관계를 매 조회 시 계산합니다 (#88).
-- 오래된 본문 스냅샷이나 URL 도메인만으로 소유권을 추정하지 않습니다.
-- 직접 URL 필드까지 포함해 다른 콘텐츠가 복사해 사용한 파일을 보존합니다.
CREATE OR REPLACE VIEW public.markdown_image_references AS
SELECT a.id AS asset_id, 'notices'::text AS source_type, n.id AS source_id
FROM markdown_image_assets a JOIN notices n ON strpos(n.content, a.url) > 0
UNION ALL
SELECT a.id, 'class_logs', c.id
FROM markdown_image_assets a JOIN class_logs c ON strpos(c.content, a.url) > 0
UNION ALL
SELECT a.id, 'weekly_texts', w.id
FROM markdown_image_assets a JOIN weekly_texts w ON strpos(coalesce(w.body, ''), a.url) > 0
UNION ALL
SELECT a.id, 'alumni_stories', s.id
FROM markdown_image_assets a JOIN alumni_stories s ON strpos(s.content, a.url) > 0 OR s.image_url = a.url
UNION ALL
SELECT a.id, 'report_templates', t.id
FROM markdown_image_assets a JOIN report_templates t ON strpos(t.body, a.url) > 0
UNION ALL
SELECT a.id, 'recruitment_settings', r.id
FROM markdown_image_assets a JOIN recruitment_settings r
  ON strpos(coalesce(r.details_markdown, ''), a.url) > 0 OR r.poster_image_url = a.url
UNION ALL
SELECT a.id, 'press_articles', p.id
FROM markdown_image_assets a JOIN press_articles p ON p.image_url = a.url
UNION ALL
SELECT a.id, 'cohorts', c.id
FROM markdown_image_assets a JOIN cohorts c ON c.image_url = a.url
UNION ALL
SELECT a.id, 'faculty', f.id
FROM markdown_image_assets a JOIN faculty f ON f.image_url = a.url
UNION ALL
SELECT a.id, 'galleries', g.id
FROM markdown_image_assets a JOIN galleries g ON g.cover_image_url = a.url
UNION ALL
SELECT a.id, 'notice_attachments', n.id
FROM markdown_image_assets a JOIN notice_attachments n ON n.url = a.url
UNION ALL
SELECT a.id, 'class_log_images', c.id
FROM markdown_image_assets a JOIN class_log_images c ON c.url = a.url
UNION ALL
SELECT a.id, 'weekly_text_images', w.id
FROM markdown_image_assets a JOIN weekly_text_images w ON w.url = a.url
UNION ALL
SELECT a.id, 'gallery_images', g.id
FROM markdown_image_assets a JOIN gallery_images g ON g.url = a.url
UNION ALL
SELECT a.id, 'alumni_story_images', s.id
FROM markdown_image_assets a JOIN alumni_story_images s ON s.url = a.url
UNION ALL
SELECT a.id, 'class_materials', c.id
FROM markdown_image_assets a JOIN class_materials c ON c.file_url = a.url
UNION ALL
SELECT a.id, 'guidebooks', g.id
FROM markdown_image_assets a JOIN guidebooks g ON g.file_url = a.url
UNION ALL
SELECT a.id, 'weekly_text_files', w.id
FROM markdown_image_assets a JOIN weekly_texts w ON w.file_url = a.url
UNION ALL
SELECT a.id, 'application_forms', f.id
FROM markdown_image_assets a JOIN application_forms f ON strpos(coalesce(f.description, ''), a.url) > 0;
