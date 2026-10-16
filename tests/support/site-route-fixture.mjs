/**
 * 전체 읽기 경로 QA의 합성 fixture와 경로 치환을 관리한다.
 * 실제 스키마는 환경 파일 없는 실행기가 drizzle-kit export로 생성하여 전달한다.
 * 학사 추가 SQL은 기존 G1 fixture의 순서·재실행 검증을 그대로 사용한다.
 */
import { readFileSync } from "node:fs";
import { hashSync } from "bcryptjs";
import { academicG1Migrations, academicG1Actors, academicG1Ids, seedAcademicG1Domain } from "./academic-g1-fixture.mjs";

export { academicG1Actors, academicG1Ids };
export const siteRoutePassword = "route-audit-only-password";
export const ids = Object.fromEntries(["alumni","notice","gallery","press","faculty","faq","log","weekly","material","guidebook","template","guide","form","question","submission","answer"].map((key,index)=>[key,`80000000-0000-4000-8000-${String(index+1).padStart(12,"0")}`]));

/** 운영 데이터나 기존 DB를 복사하지 않고 새 격리 클러스터에만 설치한다. */
export function installSiteRouteFixture(cluster, repository, schemaSql) {
 cluster.sql(schemaSql);
 const hash=hashSync(siteRoutePassword,12);
 for(const [k,u]of Object.entries(academicG1Actors))cluster.sql(`INSERT INTO users(id,name,email,password_hash,role)VALUES('${u.id}','경로 시험 ${k}','${u.email}','${hash}','${u.role}');`);
 cluster.sql(`INSERT INTO cohorts(id,name,recruitment_status,recruitment_start_date,recruitment_end_date)VALUES('${academicG1Ids.cohortA}','경로 점검 88기','OPEN',now()-interval '1 day',now()+interval '1 day'),('${academicG1Ids.cohortB}','경로 점검 89기','CLOSED',null,null);
 UPDATE users SET cohort_id='${academicG1Ids.cohortA}' WHERE role='MEMBER';
 INSERT INTO faculty(id,name,category)VALUES('${ids.faculty}','경로 시험 교수','CLASSICS');
 INSERT INTO schedule_events(id,cohort_id,title,event_date,event_type)VALUES('${academicG1Ids.event}','${academicG1Ids.cohortA}','경로 점검 수업',now(),'CLASS');
 INSERT INTO schedule_sessions(id,schedule_event_id,category,content,faculty_id)VALUES('${academicG1Ids.session}','${academicG1Ids.event}','CLASSICS','시험 수업 내용','${ids.faculty}');
 INSERT INTO alumni_stories(id,name,quote,content,is_featured)VALUES('${ids.alumni}','합성 수료생','시험 인용','시험 이야기',true);
 INSERT INTO notices(id,title,content,status,author_id)VALUES('${ids.notice}','경로 시험 공지','시험 공지 본문','PUBLISHED','${academicG1Actors.admin.id}');
 INSERT INTO galleries(id,title,description)VALUES('${ids.gallery}','경로 시험 갤러리','시험 설명');
 INSERT INTO press_articles(id,title,source,url,published_at)VALUES('${ids.press}','경로 시험 기사','시험 언론','https://route-audit.invalid/article',now());
 INSERT INTO faq_contact(id,cohort_name,contact_name,contact_phone)VALUES('${ids.faq}','시험 88기','합성 담당자','000-0000-0000');
 INSERT INTO faq_items(id,question,answer)VALUES('${ids.faq}','시험 질문','시험 답변');
 INSERT INTO class_logs(id,title,content,class_date,cohort_id,author_id)VALUES('${ids.log}','경로 시험 일지','시험 일지 본문',now(),'${academicG1Ids.cohortA}','${academicG1Actors.studentA.id}');
 INSERT INTO weekly_texts(id,title,body,cohort_id,text_type,class_date)VALUES('${ids.weekly}','경로 시험 텍스트','시험 본문','${academicG1Ids.cohortA}','고전명작',now());
 INSERT INTO class_materials(id,title,file_url,file_name)VALUES('${ids.material}','경로 시험 강의자료','https://routeaudit.private.blob.vercel-storage.com/qa/material.pdf','시험.pdf');
 INSERT INTO guidebooks(id,title,file_url,file_name)VALUES('${ids.guidebook}','경로 시험 안내','https://routeaudit.private.blob.vercel-storage.com/qa/guide.pdf','시험.pdf');
 INSERT INTO report_templates(id,slug,title,category,body)VALUES('${ids.template}','route-audit-template','경로 시험 양식','template','시험 양식'),('${ids.guide}','route-audit-guide','경로 시험 안내서','guide','시험 안내');
 INSERT INTO application_forms(id,title,cohort_id,is_published)VALUES('${ids.form}','경로 시험 지원서','${academicG1Ids.cohortA}',true);
 INSERT INTO application_questions(id,form_id,title,type,is_required)VALUES('${ids.question}','${ids.form}','지원 동기','LONG_ANSWER',true);
 INSERT INTO application_submissions(id,form_id,applicant_name,applicant_email)VALUES('${ids.submission}','${ids.form}','합성 지원자','applicant@route-audit.invalid');
 INSERT INTO application_answers(id,submission_id,question_id,value)VALUES('${ids.answer}','${ids.submission}','${ids.question}','합성 지원 동기');
 INSERT INTO recruitment_settings(active_cohort_id,recruitment_status,recruitment_start_date,deadline_date,qualification_text,details_markdown)VALUES('${academicG1Ids.cohortA}','OPEN',now()-interval '1 day',now()+interval '1 day','합성 자격','합성 모집 안내');`);
 // 대상 앱의 추가 SQL을 순서대로 두 번 적용해 재실행 계약도 검증한다.
 for (const file of academicG1Migrations) { const migration=readFileSync(`${repository}/scripts/${file}`,"utf8");cluster.sql(migration);cluster.sql(migration); }
 seedAcademicG1Domain(cluster);
 for(const file of ['migrate-protect-application-answers.sql','migrate-protect-application-submissions.sql','migrate-atomic-application-questions.sql','migrate-assert-application-question-revision.sql','sql/rate-limit-reservations.sql'])cluster.sql(readFileSync(`${repository}/scripts/${file}`,'utf8'));
}

/** 알려진 동적 경로에는 해당 테이블의 합성 UUID만 사용한다. */
export function concreteSiteRoute(path){
 if(path.includes('[...nextauth]'))return '/api/auth/session';
 if(path.includes('[slug]'))return path.replace('[slug]',path.includes('/guides/')?'route-audit-guide':'route-audit-template');
 if(path.includes('[kind]'))return path.replace('[kind]','class-materials').replace('[id]',ids.material);
 let id;
 if(path.includes('/academics/students'))id=academicG1Ids.studentA;
 else if(path.includes('/academic/')||path.includes('/academics/assignments')||path.includes('/member/assignments'))id=academicG1Ids.active;
 else if(path.includes('/application-forms')||path.includes('/recruitment/apply/'))id=ids.form;
 else if(path.includes('/class-materials'))id=ids.material;
 else if(path.includes('/guidebooks'))id=ids.guidebook;
 else if(path.includes('/weekly-texts'))id=ids.weekly;
 else if(path.includes('/resources/templates')||path.includes('/admin/templates'))id=ids.template;
 else if(path.includes('/resources/'))id=ids.log;
 else if(path.includes('/alumni/'))id=ids.alumni;
 else if(path.includes('/notices/'))id=ids.notice;
 else if(path.includes('/gallery/'))id=ids.gallery;
 else if(path.includes('/press/'))id=ids.press;
 else if(path.includes('/faculty/'))id=ids.faculty;
 else if(path.includes('/faq/'))id=ids.faq;
 else if(path.includes('/recruitment/'))id=academicG1Ids.cohortA;
 else if(path.includes('/schedule/'))id=academicG1Ids.event;
 else if(path.includes('/users/'))id=academicG1Actors.studentA.id;
 return path.replaceAll('[id]',id??'90000000-0000-4000-8000-000000000001').replace('[submissionId]',ids.submission).replace('[fileId]','90000000-0000-4000-8000-000000000002');
}
