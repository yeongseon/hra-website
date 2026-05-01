import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/lib/db/schema";
import { marked } from "marked";
import "dotenv/config";
import { eq } from "drizzle-orm";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

async function main() {
  console.log("🚀 Starting Markdown to HTML migration...");

  // 1. recruitment_settings.details_markdown
  const settings = await db.select().from(schema.recruitmentSettings);
  for (const setting of settings) {
    if (setting.detailsMarkdown) {
      const html = await marked.parse(setting.detailsMarkdown);
      await db.update(schema.recruitmentSettings)
        .set({ detailsMarkdown: html })
        .where(eq(schema.recruitmentSettings.id, setting.id));
      console.log(`✅ Migrated recruitment_settings ID: ${setting.id}`);
    }
  }

  // 2. class_logs.content
  const classLogsList = await db.select().from(schema.classLogs);
  for (const log of classLogsList) {
    if (log.content) {
      const html = await marked.parse(log.content);
      await db.update(schema.classLogs)
        .set({ content: html })
        .where(eq(schema.classLogs.id, log.id));
      console.log(`✅ Migrated class_logs ID: ${log.id}`);
    }
  }

  // 3. weekly_texts.body
  const texts = await db.select().from(schema.weeklyTexts);
  for (const text of texts) {
    if (text.body) {
      const html = await marked.parse(text.body);
      await db.update(schema.weeklyTexts)
        .set({ body: html })
        .where(eq(schema.weeklyTexts.id, text.id));
      console.log(`✅ Migrated weekly_texts ID: ${text.id}`);
    }
  }

  // 4. notices.content
  const noticeList = await db.select().from(schema.notices);
  for (const notice of noticeList) {
    if (notice.content) {
      const html = await marked.parse(notice.content);
      await db.update(schema.notices)
        .set({ content: html })
        .where(eq(schema.notices.id, notice.id));
      console.log(`✅ Migrated notices ID: ${notice.id}`);
    }
  }

  // 5. alumni_stories.content
  const stories = await db.select().from(schema.alumniStories);
  for (const story of stories) {
    if (story.content) {
      const html = await marked.parse(story.content);
      await db.update(schema.alumniStories)
        .set({ content: html })
        .where(eq(schema.alumniStories.id, story.id));
      console.log(`✅ Migrated alumni_stories ID: ${story.id}`);
    }
  }

  // 6. report_templates.body (추가 확인)
  const templates = await db.select().from(schema.reportTemplates);
  for (const tpl of templates) {
    if (tpl.body) {
      const html = await marked.parse(tpl.body);
      await db.update(schema.reportTemplates)
        .set({ body: html })
        .where(eq(schema.reportTemplates.id, tpl.id));
      console.log(`✅ Migrated report_templates ID: ${tpl.id}`);
    }
  }

  console.log("🎉 Migration completed!");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
