/**
 * G1 QA 서버에서만 로드한다. 기존 가짜 Neon→실제 PostgreSQL 전송과 SDK 목적지 제한을 결합한다.
 * production import는 없고 실행기가 명시한 NODE_OPTIONS를 통해서만 활성화한다.
 */
import "./resource-qa-preload.mjs";
import { installAcademicGateNetwork } from "./academic-g1-network.mjs";

installAcademicGateNetwork({ appOrigin: process.env.HRA_G1_APP_ORIGIN,
  storeOrigin: process.env.HRA_G1_STORE_ORIGIN, blobHost: process.env.ACADEMIC_SUBMISSION_BLOB_HOST,
  onBlocked: (code) => { console.error(`QA_G1_NETWORK_BLOCKED:${code}`); } });
