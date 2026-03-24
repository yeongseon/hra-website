import fs from "node:fs";
import path from "node:path";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocsViewer, type DocsTabItem } from "./_components/docs-viewer";

const DOCS_CONFIG: Array<Omit<DocsTabItem, "content"> & { fileName: string }> = [
  { id: "guide", label: "개발 가이드", fileName: "GUIDE.md" },
  { id: "customization", label: "페이지 수정법", fileName: "CUSTOMIZATION.md" },
  { id: "database", label: "데이터베이스", fileName: "DATABASE.md" },
  { id: "deployment", label: "배포 가이드", fileName: "DEPLOYMENT.md" },
];

function readDocFile(fileName: string) {
  const filePath = path.join(process.cwd(), "docs", fileName);
  return fs.readFileSync(filePath, "utf8");
}

export default function AdminDocsPage() {
  const docs = DOCS_CONFIG.map(({ fileName, ...item }) => ({
    ...item,
    content: readDocFile(fileName),
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">개발 문서</h1>
        <p className="mt-1 text-sm text-slate-600">
          운영과 유지보수에 필요한 주요 문서를 탭으로 확인하세요.
        </p>
      </div>

      <Card className="border border-slate-200 bg-white py-0 shadow-sm ring-0">
        <CardHeader className="border-b border-slate-200 py-4">
          <CardTitle className="text-base text-slate-900">문서 뷰어</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <DocsViewer docs={docs} />
        </CardContent>
      </Card>
    </div>
  );
}
