/** #155 브라우저 QA에서 사용하는 합성 수업·명부와 #147→#148→#149 실제 SQL 설치다. */
import { readFileSync } from "node:fs";
import { qaUsers } from "./resource-qa-postgres.mjs";
import { academicQaCohortId } from "./academic-roster-fixture.mjs";

export const academicAssignmentQaEventId = "50000000-0000-4000-8000-000000000155";
export const academicAssignmentQaSessionId = "60000000-0000-4000-8000-000000000155";

/** 호출자가 격리 사용자 fixture와 #144 명부 표를 준비한 뒤에만 실행한다. 운영 DB에는 사용하지 않는다. */
export function installAcademicAssignmentAdminFixture(cluster) {
  cluster.sql(`CREATE TABLE schedule_events (
    id uuid PRIMARY KEY, cohort_id uuid REFERENCES cohorts(id), title varchar(200) NOT NULL,
    event_date timestamp NOT NULL, event_type text NOT NULL);
    CREATE TABLE schedule_sessions (
      id uuid PRIMARY KEY, schedule_event_id uuid NOT NULL REFERENCES schedule_events(id),
      category text NOT NULL, content text, sub_title text, "order" integer NOT NULL DEFAULT 0);
    INSERT INTO schedule_events VALUES ('${academicAssignmentQaEventId}','${academicQaCohortId}',
      '과제 관리 시험 수업',now(),'CLASS');
    INSERT INTO schedule_sessions (id,schedule_event_id,category,content)
      VALUES ('${academicAssignmentQaSessionId}','${academicAssignmentQaEventId}','CLASSICS','과제 관리 시험 세부 수업');`);
  for (const name of ["migrate-academic-assignments.sql", "migrate-academic-submissions.sql", "migrate-academic-assignment-actions.sql"]) {
    cluster.sql(readFileSync(new URL(`../../scripts/${name}`, import.meta.url), "utf8"));
  }
  cluster.sql(`INSERT INTO academic_students(id,user_id,display_name) VALUES
    ('40000000-0000-4000-8000-000000000155','${qaUsers.MEMBER.id}','과제 관리 연결 학생'),
    ('40000000-0000-4000-8000-000000000156',NULL,'과제 관리 미연결 학생');
    INSERT INTO cohort_enrollments(student_id,cohort_id,created_by_user_id)
      VALUES ('40000000-0000-4000-8000-000000000155','${academicQaCohortId}','${qaUsers.FACULTY.id}'),
      ('40000000-0000-4000-8000-000000000156','${academicQaCohortId}','${qaUsers.FACULTY.id}');`);
}
