// @vitest-environment node
/**
 * #193 제출 보존 외래키를 격리 PostgreSQL에서 검증합니다.
 * 운영 DB와 .env는 사용하지 않고 임시 클러스터를 종료 후 제거합니다.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const bin = process.env.HRA_TEST_PG_BIN;
const cohortId = "11111111-1111-4111-8111-111111111111";
const formId = "22222222-2222-4222-8222-222222222222";
const submissionId = "33333333-3333-4333-8333-333333333333";

describe.skipIf(!bin)("지원서 연쇄 삭제 방지", () => {
  let root: string;
  let started = false;
  let psqlArgs: string[];
  const program = (name: string) => join(bin!, name);
  const run = (query: string) => execFileSync(program("psql"), psqlArgs, {
    input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  const reset = () => run(`TRUNCATE public.applications, public.application_submissions,
    public.application_forms, public.cohorts;
    INSERT INTO public.cohorts VALUES ('${cohortId}');
    INSERT INTO public.application_forms VALUES ('${formId}', '${cohortId}');`);

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "hra-protect-submissions-"));
    execFileSync(program("initdb"), ["-D", join(root, "data"), "-A", "trust", "-U", "hra_test", "--no-locale", "-E", "UTF8"], { stdio: "pipe" });
    execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-l", join(root, "server.log"),
      "-o", `-h '' -k ${root} -p 55441`, "-w", "start"], { stdio: "pipe" });
    started = true;
    psqlArgs = ["-X", "-h", root, "-p", "55441", "-U", "hra_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
    run(`CREATE TABLE public.cohorts (id uuid PRIMARY KEY);
      CREATE TABLE public.application_forms (id uuid PRIMARY KEY,
        cohort_id uuid REFERENCES public.cohorts(id) ON DELETE CASCADE);
      CREATE TABLE public.application_submissions (id uuid PRIMARY KEY,
        form_id uuid NOT NULL,
        CONSTRAINT application_submissions_form_id_application_forms_id_fk
          FOREIGN KEY (form_id) REFERENCES public.application_forms(id) ON DELETE CASCADE);
      CREATE TABLE public.applications (id uuid PRIMARY KEY, cohort_id uuid NOT NULL,
        CONSTRAINT applications_cohort_id_cohorts_id_fk
          FOREIGN KEY (cohort_id) REFERENCES public.cohorts(id) ON DELETE CASCADE);`);
    const migration = readFileSync("scripts/migrate-protect-application-submissions.sql", "utf8");
    run(migration);
    run(migration);
  }, 30000);

  afterAll(() => {
    try {
      if (started) execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
    } finally {
      if (root) rmSync(root, { recursive: true, force: true });
    }
  });

  it("두 제출 외래키를 RESTRICT로 바꾸고 다시 실행해도 유지한다", () => {
    expect(run(`SELECT conname || ':' || confdeltype::text FROM pg_constraint
      WHERE conname IN ('application_submissions_form_id_application_forms_id_fk',
        'applications_cohort_id_cohorts_id_fk') ORDER BY conname;`))
      .toBe("application_submissions_form_id_application_forms_id_fk:r\napplications_cohort_id_cohorts_id_fk:r");
  });

  it("신규 제출이 있으면 양식과 기수 모두 삭제되지 않는다", () => {
    reset();
    run(`INSERT INTO public.application_submissions VALUES ('${submissionId}', '${formId}');`);
    expect(() => run(`DELETE FROM public.application_forms WHERE id = '${formId}';`)).toThrow();
    expect(() => run(`DELETE FROM public.cohorts WHERE id = '${cohortId}';`)).toThrow();
    expect(run("SELECT count(*) FROM public.application_submissions;")).toBe("1");
    expect(run("SELECT count(*) FROM public.cohorts;")).toBe("1");
  });

  it("레거시 지원서가 있으면 기수를 보존한다", () => {
    reset();
    run(`INSERT INTO public.applications VALUES ('${submissionId}', '${cohortId}');`);
    expect(() => run(`DELETE FROM public.cohorts WHERE id = '${cohortId}';`)).toThrow();
    expect(run("SELECT count(*) FROM public.applications;")).toBe("1");
  });

  it("제출 없는 양식은 삭제할 수 있다", () => {
    reset();
    run(`DELETE FROM public.application_forms WHERE id = '${formId}';`);
    expect(run("SELECT count(*) FROM public.application_forms;")).toBe("0");
  });

  it("동시 제출이 먼저 잠금을 잡으면 양식 삭제가 실패하고 제출을 보존한다", async () => {
    reset();
    const submit = spawn(program("psql"), psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
    let submitOutput = "";
    submit.stdout.on("data", (chunk) => { submitOutput += String(chunk); });
    submit.stdin.write(`BEGIN; INSERT INTO public.application_submissions VALUES ('${submissionId}', '${formId}'); SELECT 'ready';\n`);
    for (let attempt = 0; attempt < 50 && !submitOutput.includes("ready"); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(submitOutput).toContain("ready");

    const deletion = spawn(program("psql"), psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
    let deleteError = "";
    deletion.stderr.on("data", (chunk) => { deleteError += String(chunk); });
    const deleted = new Promise<number | null>((resolve) => deletion.on("close", resolve));
    deletion.stdin.end(`DELETE FROM public.application_forms WHERE id = '${formId}';\n`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    submit.stdin.end("COMMIT;\n");
    await deleted;
    expect(deleteError).toContain("foreign key constraint");
    expect(run("SELECT count(*) FROM public.application_submissions;")).toBe("1");
  });
});
