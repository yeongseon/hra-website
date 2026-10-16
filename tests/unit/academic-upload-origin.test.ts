// @vitest-environment node
/** Next의 loopback 정규화와 Vercel의 전달 Host를 실제 HTTP authority 기준으로 비교한다. */
import { describe,expect,it,vi } from "vitest";
vi.mock("server-only",()=>({}));vi.mock("@/lib/academic-permissions",()=>({AcademicAccessError:class extends Error{}}));
import { assertUploadOrigin } from "@/features/academics/assignment-uploads/http";
function request(url:string,origin:string|null,host?:string,forwarded?:string){return new Request(url,{method:"POST",headers:{...(origin?{Origin:origin}:{}),...(host?{Host:host}:{}),...(forwarded?{"x-forwarded-host":forwarded}:{})}});}
describe("과제 업로드의 동일 출처",()=>{
 it("Next가 URL을 localhost로 바꿔도 실제 접속한 127 Host의 같은 출처를 허용한다",()=>{
  expect(()=>assertUploadOrigin(request("http://localhost:35151/api/academic/uploads/intents","http://127.0.0.1:35151","127.0.0.1:35151"))).not.toThrow();
  expect(()=>assertUploadOrigin(request("http://localhost:35151/api/academic/uploads/intents","http://localhost:35151","127.0.0.1:35151"))).toThrow();
 });
 it("Vercel 배포 도메인·별칭의 HTTPS Host와 Origin이 같으면 허용한다",()=>{
  for(const host of ["preview-151.vercel.app","academic.example.invalid"]){
   expect(()=>assertUploadOrigin(request("https://internal-next.invalid/api/academic/uploads/intents",`https://${host}`,host))).not.toThrow();
  }
 });
 it("교차 출처·다른 포트·프로토콜·Origin 누락·forwarded-host 위조를 거부한다",()=>{
  for(const origin of ["https://other.invalid","http://app.invalid","https://app.invalid:444",null]){
   expect(()=>assertUploadOrigin(request("https://app.invalid/api/academic/uploads/intents",origin,"app.invalid","other.invalid"))).toThrow();
  }
  expect(()=>assertUploadOrigin(request("https://app.invalid/api/academic/uploads/intents","https://other.invalid","app.invalid","other.invalid"))).toThrow();
 });
 it("조작된 Host와 여러 authority를 거부한다",()=>{
  for(const host of ["app.invalid,other.invalid","user@app.invalid","app.invalid/path","app.invalid?x=1","app.invalid#x","app .invalid"]){
   expect(()=>assertUploadOrigin(request("https://app.invalid/api/academic/uploads/intents","https://app.invalid",host))).toThrow();
  }
 });
 it("Host가 없는 표준 Request는 URL 출처로 검사하며 forwarded-host만으로 우회하지 못한다",()=>{
  expect(()=>assertUploadOrigin(request("https://app.invalid/api/academic/uploads/intents","https://app.invalid"))).not.toThrow();
  expect(()=>assertUploadOrigin(request("https://app.invalid/api/academic/uploads/intents","https://other.invalid",undefined,"other.invalid"))).toThrow();
 });
});
