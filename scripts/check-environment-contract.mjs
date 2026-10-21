/**
 * 환경 계약 CLI입니다. 허용한 소스·.env.example·생성 문서·vercel.json만 읽습니다.
 * 실제 환경이나 앱을 로드하지 않으며 문서 갱신은 명시적 인자가 있을 때만 수행합니다.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { environmentInventory } from "./_lib/environment-inventory.mjs";
import { configPaths, referencePath, renderEnvironmentReference, sourceRoots, validateEnvironmentContract } from "./_lib/environment-contract.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--write-reference")) {
  console.error("사용법: node scripts/check-environment-contract.mjs [--write-reference]");
  process.exitCode = 1;
} else {
  try {
    const read = (path) => readFileSync(join(root, path), "utf8");
    const sources = [];
    const visit = (directory) => {
      for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) visit(path);
        else if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(path)) sources.push({ path: relative(root, join(root, path)), text: read(path) });
      }
    };
    sourceRoots.forEach(visit);
    for (const path of configPaths) sources.push({ path, text: read(path) });
    if (args[0] === "--write-reference") writeFileSync(join(root, referencePath), renderEnvironmentReference(environmentInventory));
    const errors = validateEnvironmentContract({ inventory: environmentInventory, sources, example: read(".env.example"), document: read(referencePath), crons: JSON.parse(read("vercel.json")).crons });
    for (const error of errors) console.error(error);
    console.log(errors.length ? "환경변수 계약 검사 실패" : `환경변수 계약 검사 통과 (${environmentInventory.variables.length}개 이름)`);
    process.exitCode = errors.length ? 1 : 0;
  } catch {
    console.error("환경 계약 파일을 읽거나 검사하지 못했습니다. 실제 설정값은 출력하지 않습니다.");
    process.exitCode = 1;
  }
}
