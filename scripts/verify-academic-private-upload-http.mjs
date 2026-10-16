/**
 * #151 실제 공급자 PoC. 승인된 private 저장소의 QA namespace 사용 권한만 외부 환경으로 전달한다.
 * 정상 credentials→실제 Next API→SDK 직접PUT→실제 원본검증→토큰만료/유예후 원장 정리를 실행한다.
 * 운영 DB·회원·자료를 읽지 않으며 DB는 격리 PostgreSQL, 파일은 이 실행이 발급한 UUID 하나다.
 */
import { spawn } from "node:child_process";
import { randomBytes,randomUUID,createHash } from "node:crypto";
import { readFileSync,mkdtempSync,writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname,join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { put as clientPut } from "@vercel/blob/client";
import { BlobNotFoundError,head } from "@vercel/blob";
import { createQaPostgres,installQaFixture,qaUsers,qaPassword } from "../tests/support/resource-qa-postgres.mjs";
const repository=dirname(dirname(fileURLToPath(import.meta.url)));
const host=process.env.ACADEMIC_SUBMISSION_BLOB_HOST,token=process.env.ACADEMIC_SUBMISSION_READ_WRITE_TOKEN;
class QaCheckError extends Error {}
let phase="CONFIG",lastHttpStatus=null;
const check=(condition,label)=>{if(!condition)throw new QaCheckError(label);};
const manifestDirectory=mkdtempSync(join(tmpdir(),"hra-private-upload151-manifest-"));
const manifestPath=join(manifestDirectory,"fixture.json");
let cluster,server,done,baseUrl,manifest;
const cookieMap=new Map();
const cookies=response=>{for(const header of response.headers.getSetCookie()){const pair=header.split(";",1)[0];const index=pair.indexOf("=");if(index>0)cookieMap.set(pair.slice(0,index),pair.slice(index+1));}};
const cookieHeader=()=>[...cookieMap].map(([name,value])=>`${name}=${value}`).join("; ");
const baseEnvironment=()=>Object.fromEntries(["PATH","HOME","TMPDIR","TMP","TEMP","SYSTEMROOT"].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
async function port(){const listener=createServer();await new Promise((resolve,reject)=>{listener.once("error",reject);listener.listen(0,"127.0.0.1",resolve);});const value=listener.address().port;await new Promise(resolve=>listener.close(resolve));return value;}
async function post(path,body,authenticated=true){const response=await fetch(`${baseUrl}${path}`,{method:"POST",headers:{"Content-Type":"application/json",Origin:baseUrl,...(authenticated?{Cookie:cookieHeader()}: {})},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});lastHttpStatus=response.status;return response;}
try{
 check(typeof host==="string" && /^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(host) && typeof token==="string" && token.length>0,"승인된 private 저장소 설정 필요");
 check(process.env.HRA_ACADEMIC_QA_PRIVATE_STORE_CONFIRMED==="true","QA 전용 namespace·원장 사용 승인 확인 필요");
 phase="PG_FIXTURE";cluster=createQaPostgres(process.env.HRA_TEST_PG_BIN);installQaFixture(cluster,"https://qa.invalid/unused.pdf");
 cluster.sql("CREATE TABLE cohorts(id uuid PRIMARY KEY);CREATE TABLE schedule_events(id uuid PRIMARY KEY,cohort_id uuid REFERENCES cohorts(id));CREATE TABLE schedule_sessions(id uuid PRIMARY KEY,schedule_event_id uuid REFERENCES schedule_events(id));");
 for(const name of ["migrate-academic-students.sql","migrate-academic-assignments.sql","migrate-academic-submissions.sql","migrate-academic-upload-authorizations.sql"])cluster.sql(readFileSync(join(repository,"scripts",name),"utf8"));
 phase="NEXT_START";baseUrl=`http://127.0.0.1:${await port()}`;const cronSecret=randomBytes(32).toString("hex");
 const environment={...baseEnvironment(),...cluster.environment,NODE_ENV:"development",NEXT_TELEMETRY_DISABLED:"1",AUTH_SECRET:randomBytes(48).toString("hex"),AUTH_TRUST_HOST:"true",AUTH_URL:baseUrl,NEXTAUTH_URL:baseUrl,NEXT_PUBLIC_APP_URL:baseUrl,
  AUTH_GOOGLE_ID:"",AUTH_GOOGLE_SECRET:"",AUTH_KAKAO_ID:"",AUTH_KAKAO_SECRET:"",BLOB_READ_WRITE_TOKEN:"",RESOURCE_PRIVATE_READ_WRITE_TOKEN:"",
  ACADEMIC_ENABLED:"true",ACADEMIC_UPLOADS_ENABLED:"true",ACADEMIC_SUBMISSION_BLOB_HOST:host,ACADEMIC_SUBMISSION_READ_WRITE_TOKEN:token,
  ACADEMIC_UPLOAD_CLEANUP_ENABLED:"true",ACADEMIC_UPLOAD_CLEANUP_DELETE_ENABLED:"true",CRON_SECRET:cronSecret,
  // localhost callback 전달은 불가능하다. 미전달 상태의 명시적 verify 복구를 검사한다.
  VERCEL_BLOB_CALLBACK_URL:process.env.HRA_ACADEMIC_QA_CALLBACK_URL??"https://academic-upload-qa.invalid/api/academic/uploads",
  NODE_OPTIONS:`--import=${JSON.stringify(join(repository,"tests/support/resource-qa-preload.mjs"))}`};
 server=spawn(process.execPath,[join(repository,"node_modules/next/dist/bin/next"),"dev","--webpack","--hostname","127.0.0.1","--port",new URL(baseUrl).port],{cwd:repository,env:environment,detached:true,stdio:["ignore","pipe","pipe"]});
 let exited=false;done=new Promise(resolve=>{server.once("error",()=>{exited=true;resolve();});server.once("exit",()=>{exited=true;resolve();});});server.stdout.resume();server.stderr.resume();
 let ready=false;for(let attempt=0;attempt<180 && !exited;attempt++){try{const response=await fetch(`${baseUrl}/api/auth/csrf`,{signal:AbortSignal.timeout(5000)});if(response.ok){await response.body?.cancel();ready=true;break;}}catch{ready=false;}await delay(500);}check(ready,"격리 Next 서버 준비 실패");
 phase="LOGIN";const csrfResponse=await fetch(`${baseUrl}/api/auth/csrf`);cookies(csrfResponse);const csrf=await csrfResponse.json();
 const login=await fetch(`${baseUrl}/api/auth/callback/credentials`,{method:"POST",redirect:"manual",headers:{"Content-Type":"application/x-www-form-urlencoded",Origin:baseUrl,Cookie:cookieHeader(),"X-Auth-Return-Redirect":"1"},body:new URLSearchParams({csrfToken:csrf.csrfToken,email:qaUsers.MEMBER.email,password:qaPassword,callbackUrl:baseUrl})});cookies(login);await login.body?.cancel();
 const session=await(await fetch(`${baseUrl}/api/auth/session`,{headers:{Cookie:cookieHeader()}})).json();check(session.user?.id===qaUsers.MEMBER.id && session.user?.role==="MEMBER","정상 credentials 인증 실패");console.log("PASS 실제 credentials 세션");
 phase="ASSIGNMENT_FIXTURE";lastHttpStatus=null;const cohort=randomUUID(),student=randomUUID(),assignment=randomUUID();
 cluster.sql(`INSERT INTO cohorts VALUES('${cohort}');INSERT INTO academic_students(id,user_id,display_name)VALUES('${student}','${qaUsers.MEMBER.id}','비공개 업로드 시험');INSERT INTO cohort_enrollments(student_id,cohort_id)VALUES('${student}','${cohort}');
  INSERT INTO assignments(id,cohort_id,title,due_at,created_by_user_id)VALUES('${assignment}','${cohort}','비공개 업로드 시험',clock_timestamp()+interval '5 minutes','${qaUsers.ADMIN.id}');SELECT id FROM publish_academic_assignment('${assignment}','${qaUsers.ADMIN.id}');`);
 const input={assignmentId:assignment,requestId:randomUUID(),originalName:"비공개 시험.pdf",sizeBytes:50*1024*1024,mimeType:"application/pdf"};
 phase="DENIED_INTENT";const denied=await post("/api/academic/uploads/intents",input,false);check(denied.status===401,"비로그인 업로드 승인 차단 실패");await denied.body?.cancel();
 phase="OVERSIZE_INTENT";const oversized=await post("/api/academic/uploads/intents",{...input,sizeBytes:input.sizeBytes+1});check(oversized.status===422,"50MiB 초과 승인 차단 실패");await oversized.body?.cancel();
 phase="CREATE_INTENT";const issuedResponse=await post("/api/academic/uploads/intents",input);check(issuedResponse.ok,"실제 업로드 의도 발급 실패");const issued=await issuedResponse.json();
 check(issued.pathname===`academic-uploads/v1/${issued.uploadIntentId}/document.pdf`,"서버 고유 경로 불일치");
 manifest={host,intentId:issued.uploadIntentId,pathname:issued.pathname,expiresAt:issued.expiresAt,cleanupAfter:new Date(Date.parse(issued.expiresAt)+300000).toISOString(),cleaned:false};writeFileSync(manifestPath,JSON.stringify(manifest),{mode:0o600});console.log(`QA 원장 보관: ${manifestPath}`);
 phase="TOKEN_GRANT";const grantResponse=await post("/api/academic/uploads",{type:"blob.generate-client-token",payload:{pathname:issued.pathname,multipart:false,clientPayload:JSON.stringify({assignmentId:assignment,uploadIntentId:issued.uploadIntentId})}});check(grantResponse.ok,"실제 SDK 토큰 발급 실패");const grant=await grantResponse.json();check(typeof grant.clientToken==="string","SDK 응답 토큰 누락");
 const body=Buffer.alloc(input.sizeBytes);Buffer.from("%PDF-1.7\n").copy(body);Buffer.from("\n%%EOF").copy(body,body.length-6);const checksum=createHash("sha256").update(body).digest("hex");
 phase="PROVIDER_PUT";const uploaded=await clientPut(issued.pathname,body,{access:"private",token:grant.clientToken,contentType:"application/pdf",multipart:false});check(new URL(uploaded.url).host===host,"실제 저장소 호스트 불일치");console.log("PASS 실제 SDK 50MiB 비공개 직접 PUT");
 phase="ANON_READ";const anonymous=await fetch(uploaded.url,{redirect:"manual"});check(anonymous.status===403,"익명 private 객체 읽기 차단 실패");await anonymous.body?.cancel();
 phase="OVERWRITE";let overwriteRejected=false;try{await clientPut(issued.pathname,body,{access:"private",token:grant.clientToken,contentType:"application/pdf",multipart:false});}catch{overwriteRejected=true;}check(overwriteRejected,"동일 토큰 덮어쓰기 차단 실패");console.log("PASS 익명403·동일경로 덮어쓰기 거부");
 phase="VERIFY";const verified=await post(`/api/academic/uploads/${issued.uploadIntentId}/verify`,{assignmentId:assignment});check(verified.ok,"실제 원본 검증 API 실패");await verified.body?.cancel();
 const state=cluster.sql(`SELECT state||':'||size_bytes||':'||checksum FROM assignment_upload_intents WHERE id='${issued.uploadIntentId}';`);check(state===`VERIFIED:${body.length}:${checksum}`,"실제 DB 검증 메타/해시 불일치");check(cluster.sql("SELECT count(*) FROM assignment_submissions")==="0","업로드만으로 최종 제출이 생성됨");console.log("PASS callback 미전달 복구·실제 서버 hash·VERIFIED/최종0");
 phase="FORGED_CALLBACK";const forged=await fetch(`${baseUrl}/api/academic/uploads`,{method:"POST",headers:{"Content-Type":"application/json","x-vercel-signature":"forged"},body:JSON.stringify({type:"blob.upload-completed",payload:{blob:uploaded,tokenPayload:JSON.stringify({uploadIntentId:issued.uploadIntentId})}})});check(!forged.ok,"위조 callback 서명 차단 실패");await forged.body?.cancel();
 phase="CANCEL";const cancelled=await fetch(`${baseUrl}/api/academic/uploads/intents/${issued.uploadIntentId}`,{method:"DELETE",headers:{"Content-Type":"application/json",Origin:baseUrl,Cookie:cookieHeader()},body:JSON.stringify({assignmentId:assignment})});check(cancelled.ok,"실제 취소 원장 저장 실패");await cancelled.body?.cancel();
 check(cluster.sql("SELECT count(*) FROM academic_upload_authorizations")==="1","정리 범위가 실행 원장 하나가 아님");
 phase="EXPIRY_WAIT";const cleanupAt=Date.parse(manifest.cleanupAfter)+1500;console.log("토큰 실제 만료와 5분 유예를 기다립니다.");while(Date.now()<cleanupAt){await delay(Math.min(30000,cleanupAt-Date.now()));}
 phase="CLEANUP";const cleanup=await fetch(`${baseUrl}/api/cron/cleanup-academic-uploads`,{headers:{Authorization:`Bearer ${cronSecret}`}});check(cleanup.ok,"실제 원장 정리 API 실패");const cleanupResult=await cleanup.json();check(cleanupResult.deleted===1 && cleanupResult.failed===0,"실제 fixture 정리 건수 불일치");
 phase="CONFIRM_DELETE";let missing=false;try{await head(issued.pathname,{token});}catch(error){missing=error instanceof BlobNotFoundError;}check(missing,"정리 후 private 객체가 남음");
 manifest.cleaned=true;writeFileSync(manifestPath,JSON.stringify(manifest),{mode:0o600});console.log("PASS 실제 토큰 만료+유예 후 원장 fixture만 삭제");
}catch(error){console.error(`QA_PHASE:${phase}`);if(lastHttpStatus!==null)console.error(`QA_HTTP_STATUS:${lastHttpStatus}`);if(error instanceof QaCheckError)console.error(`QA_CHECK:${error.message}`);console.error("비공개 업로드 PoC 실패. 원본 SQL·연결·파일정보는 출력하지 않습니다.");console.error(`잔여 fixture가 있으면 원장을 확인하세요: ${manifestPath}`);process.exitCode=1;}
finally{if(server){try{process.kill(-server.pid,"SIGTERM");}catch(error){if(error.code!=="ESRCH")process.exitCode=1;}await Promise.race([done,delay(5000)]);if(server.exitCode===null){try{process.kill(-server.pid,"SIGKILL");}catch(error){if(error.code!=="ESRCH")process.exitCode=1;}}}cluster?.close();}
