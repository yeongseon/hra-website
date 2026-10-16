// @vitest-environment node
/** G1 전체 migration 조합에서도 실제 파일 인가 SQL이 소유자·관리자·학적 종료를 판단하는지 확인한다. */
import { createHash, randomUUID } from "node:crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { buildAuthorizedSubmissionFileRead } from "@/features/academics/submission-files/data";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport } from "../support/neon-psql-transport.mjs";
import { resourceQaPdfBytes } from "../support/resource-qa-pdf.mjs";
import { academicG1Actors as actors, academicG1Ids as ids, academicG1Sql, installAcademicG1Base,
  installAcademicG1Migrations, seedAcademicG1Domain } from "../support/academic-g1-fixture.mjs";

it.skipIf(!process.env.HRA_TEST_PG_BIN)("전체 범위 SQL 뒤 허용 파일 조회·감사와 학적 종료 후 거부가 유지된다", async () => {
  const cluster = createQaPostgres(process.env.HRA_TEST_PG_BIN);
  try {
    installAcademicG1Base(cluster); installAcademicG1Migrations(cluster); seedAcademicG1Domain(cluster);
    const sql = academicG1Sql(cluster.environment), target = await sql("SELECT t.id FROM assignment_targets t JOIN cohort_enrollments e ON e.id=t.enrollment_id WHERE t.assignment_id=$1::uuid AND e.student_id=$2::uuid", [ids.active, ids.studentA]);
    const bytes = resourceQaPdfBytes(), checksum = createHash("sha256").update(bytes).digest("hex");
    const intent = await sql("SELECT issue_academic_assignment_upload($1::uuid,$2::uuid,$3::uuid,'시험.pdf',$4::integer)", [randomUUID(), target, actors.studentA.id, bytes.length]);
    await sql("SELECT verify_authorized_academic_upload($1::uuid,$2::uuid,$3,$4)", [intent, actors.studentA.id, checksum, checksum]);
    const completed = await sql("SELECT complete_academic_assignment_submission($1::uuid,$2::uuid,$3::uuid,$4::uuid,true)", [target, actors.studentA.id, intent, randomUUID()]);
    if (!completed) throw new Error("G1_FIXTURE_FINAL_MISSING");
    const final = JSON.parse(completed);
    const fileId = await sql("SELECT id FROM assignment_submission_files WHERE submission_id=$1::uuid", [final.submissionId]);
    if (!fileId) throw new Error("G1_FIXTURE_FILE_MISSING");
    const execute = createPsqlTransport(cluster.environment), dialect = new PgDialect();
    const read = async (management = false) => {
      const query = dialect.sqlToQuery(buildAuthorizedSubmissionFileRead({ userId: management ? actors.manager.id : actors.studentA.id,
        scope: management ? "MANAGEMENT" : "OWNER", approverId: actors.manager.id }, final.submissionId, fileId));
      return execute({ query: query.sql, params: query.params.map(value => value === null ? null : String(value)) });
    };
    expect((await read()).rows).toHaveLength(1); expect((await read(true)).rows).toHaveLength(1);
    await sql("UPDATE cohort_enrollments SET ended_at=clock_timestamp() WHERE student_id=$1::uuid", [ids.studentA]);
    expect((await read()).rows).toHaveLength(0); expect((await read(true)).rows).toHaveLength(1);
  } finally { cluster.close(); }
}, 30_000);
