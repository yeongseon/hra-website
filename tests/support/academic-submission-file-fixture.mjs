/**
 * 개인 제출 파일 권한의 격리 PostgreSQL fixture입니다.
 * 실제 #144/#147/#148/#153 migration과 업로드 검증·최종화 함수를 사용하며 Blob에는 쓰지 않습니다.
 */
import { readFileSync } from "node:fs";
import { installQaFixture, qaUsers } from "./resource-qa-postgres.mjs";
import { resourceQaPdfBytes, resourceQaPdfSha256 } from "./resource-qa-pdf.mjs";
import { sqlLiteral } from "./neon-psql-transport.mjs";

export const fileQaIdentities = {
  owner: qaUsers.MEMBER,
  peer: { id: "10000000-0000-4000-8000-000000000005", email: "same-cohort@submission-qa.invalid" },
  otherCohort: { id: "10000000-0000-4000-8000-000000000006", email: "other-cohort@submission-qa.invalid" },
  approver: qaUsers.FACULTY,
  otherFaculty: { id: "10000000-0000-4000-8000-000000000007", email: "other-faculty@submission-qa.invalid" },
  admin: qaUsers.ADMIN, pending: qaUsers.PENDING,
};
export const fileQaIds = {
  cohort: "20000000-0000-4000-8000-000000000001", otherCohort: "20000000-0000-4000-8000-000000000002",
  student: "30000000-0000-4000-8000-000000000001", peer: "30000000-0000-4000-8000-000000000002",
  otherStudent: "30000000-0000-4000-8000-000000000003",
  enrollment: "40000000-0000-4000-8000-000000000001", peerEnrollment: "40000000-0000-4000-8000-000000000002",
  otherEnrollment: "40000000-0000-4000-8000-000000000003",
  assignment: "60000000-0000-4000-8000-000000000001", otherAssignment: "60000000-0000-4000-8000-000000000002",
  ownerIntent: "70000000-0000-4000-8000-000000000001", peerIntent: "70000000-0000-4000-8000-000000000002",
};
export const defaultQaSubmissionKey = `academic-uploads/v1/${fileQaIds.ownerIntent}/document.pdf`;

/** 사용자·요청 제한만 있는 상태는 비활성 gate의 실제 HTTP 검증에도 사용합니다. */
export function installSubmissionFileIdentities(cluster) {
  installQaFixture(cluster, "https://unused.private.blob.vercel-storage.com/qa/unused.pdf");
  for (const [person, role] of [[fileQaIdentities.peer, "MEMBER"], [fileQaIdentities.otherCohort, "MEMBER"], [fileQaIdentities.otherFaculty, "FACULTY"]]) {
    cluster.sql(`INSERT INTO users (id,name,email,password_hash,role)
      SELECT '${person.id}', '제출 파일 권한 시험 계정', '${person.email}', password_hash, '${role}'
      FROM users WHERE id='${qaUsers.MEMBER.id}';`);
  }
}

export function installSubmissionFileMigrations(cluster) {
  cluster.sql(`CREATE TABLE cohorts (id uuid PRIMARY KEY, name text NOT NULL, "order" integer NOT NULL DEFAULT 0);
    CREATE TABLE schedule_events (id uuid PRIMARY KEY, cohort_id uuid REFERENCES cohorts(id));
    CREATE TABLE schedule_sessions (id uuid PRIMARY KEY, schedule_event_id uuid REFERENCES schedule_events(id));
    INSERT INTO cohorts (id,name) VALUES ('${fileQaIds.cohort}','파일 시험 기수'),('${fileQaIds.otherCohort}','다른 시험 기수');`);
  for (const name of ["migrate-academic-students.sql", "migrate-academic-assignments.sql", "migrate-academic-submissions.sql", "migrate-academic-submission-file-reads.sql"]) {
    cluster.sql(readFileSync(new URL(`../../scripts/${name}`, import.meta.url), "utf8"));
  }
}

/** 한 기수의 두 학생과 다른 기수 학생을 만들고 두 최종 제출을 실제 함수로 확정합니다. */
export function seedSubmissionFileRows(cluster, ownerStorageKey = defaultQaSubmissionKey) {
  cluster.sql(`TRUNCATE academic_submission_file_reads,assignment_submission_files,assignment_submissions,
      assignment_upload_intents,assignment_targets,assignments,cohort_enrollments,academic_students;
    UPDATE users SET role='MEMBER' WHERE id IN ('${fileQaIdentities.owner.id}','${fileQaIdentities.peer.id}','${fileQaIdentities.otherCohort.id}');
    UPDATE users SET role='FACULTY' WHERE id IN ('${fileQaIdentities.approver.id}','${fileQaIdentities.otherFaculty.id}');
    INSERT INTO academic_students(id,user_id,display_name) VALUES
      ('${fileQaIds.student}','${fileQaIdentities.owner.id}','파일 시험 학생'),
      ('${fileQaIds.peer}','${fileQaIdentities.peer.id}','같은 기수 시험 학생'),
      ('${fileQaIds.otherStudent}','${fileQaIdentities.otherCohort.id}','다른 기수 시험 학생');
    INSERT INTO cohort_enrollments(id,student_id,cohort_id) VALUES
      ('${fileQaIds.enrollment}','${fileQaIds.student}','${fileQaIds.cohort}'),
      ('${fileQaIds.peerEnrollment}','${fileQaIds.peer}','${fileQaIds.cohort}'),
      ('${fileQaIds.otherEnrollment}','${fileQaIds.otherStudent}','${fileQaIds.otherCohort}');
    INSERT INTO assignments(id,cohort_id,title,due_at,created_by_user_id) VALUES
      ('${fileQaIds.assignment}','${fileQaIds.cohort}','개인 파일 시험',clock_timestamp()+interval '1 hour','${fileQaIdentities.approver.id}'),
      ('${fileQaIds.otherAssignment}','${fileQaIds.otherCohort}','다른 기수 과제',clock_timestamp()+interval '1 hour','${fileQaIdentities.approver.id}');
    SELECT publish_academic_assignment('${fileQaIds.assignment}','${fileQaIdentities.approver.id}');
    SELECT publish_academic_assignment('${fileQaIds.otherAssignment}','${fileQaIdentities.approver.id}');`);
  const ownerIntent = ownerStorageKey.split("/")[2];
  /** @type {Record<string, {submissionId: string, fileId: string, targetId: string, storageKey: string}>} */
  const result = {};
  for (const [name, person, enrollment, intent, key, request] of [
    ["owner", fileQaIdentities.owner, fileQaIds.enrollment, ownerIntent, ownerStorageKey, "80000000-0000-4000-8000-000000000001"],
    ["peer", fileQaIdentities.peer, fileQaIds.peerEnrollment, fileQaIds.peerIntent,
      `academic-uploads/v1/${fileQaIds.peerIntent}/document.pdf`, "80000000-0000-4000-8000-000000000002"],
  ]) {
    const target = cluster.sql(`SELECT id FROM assignment_targets WHERE enrollment_id='${enrollment}'`);
    cluster.sql(`INSERT INTO assignment_upload_intents(id,assignment_target_id,user_id,storage_key,expires_at)
      VALUES('${intent}','${target}','${person.id}',${sqlLiteral(key)},clock_timestamp()+interval '30 minutes');
      SELECT verify_academic_assignment_upload('${intent}','${person.id}','한글 과제.pdf','application/pdf',${resourceQaPdfBytes().length},'${resourceQaPdfSha256()}');`);
    const submissionId = cluster.sql(`SELECT finalize_academic_assignment_submission('${target}','${person.id}','${intent}','${request}')`);
    const fileId = cluster.sql(`SELECT id FROM assignment_submission_files WHERE submission_id='${submissionId}'`);
    result[name] = { submissionId, fileId, targetId: target, storageKey: key };
  }
  return result;
}
