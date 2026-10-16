/**
 * 학사 명부 브라우저 QA용 합성 계정·기수와 실제 migration을 준비합니다.
 * 공통 자료 QA의 임시 PostgreSQL·정상 credentials fixture를 재사용하며 운영 정보는 읽지 않습니다.
 */
import { readFileSync } from "node:fs";
import { installQaFixture, qaUsers } from "./resource-qa-postgres.mjs";

export const academicQaCohortId = "30000000-0000-4000-8000-000000000146";
export const academicQaOtherFaculty = {
  id: "10000000-0000-4000-8000-000000000005",
  email: "other-faculty@academic-qa.invalid",
};

/** 홈페이지 관리자와 별개인 승인자 FACULTY 및 비승인 교수를 함께 만듭니다. */
export function installAcademicIdentityFixture(cluster) {
  installQaFixture(cluster, "https://resource-qa.private.blob.vercel-storage.com/qa/resource-access-http/unused.pdf");
  cluster.sql(`INSERT INTO users (id, name, email, password_hash, role)
    SELECT '${academicQaOtherFaculty.id}', '학사 비승인 교수 시험 계정', '${academicQaOtherFaculty.email}', password_hash, 'FACULTY'
    FROM users WHERE id = '${qaUsers.FACULTY.id}';`);
}

/** 표가 없는 비활성 QA 후에만 #144→#145→#146 SQL을 순서대로 실제 적용합니다. */
export function installAcademicRosterMigrations(cluster) {
  cluster.sql(`CREATE TABLE cohorts (id uuid PRIMARY KEY, name varchar(100) NOT NULL, "order" integer NOT NULL DEFAULT 0);
    INSERT INTO cohorts (id, name) VALUES ('${academicQaCohortId}', '학사 명부 시험 기수');`);
  for (const name of ["migrate-academic-students.sql", "migrate-academic-enrollment-links.sql", "migrate-academic-roster.sql"]) {
    cluster.sql(readFileSync(new URL(`../../scripts/${name}`, import.meta.url), "utf8"));
  }
}

/** 화면 작업이 사용자 역할·기수·로그인 정보를 바꾸지 않는지 비교할 최소 지문입니다. */
export function academicQaUserFingerprint(cluster) {
  return cluster.sql("SELECT md5(jsonb_agg(to_jsonb(u) ORDER BY id)::text) FROM users u");
}
