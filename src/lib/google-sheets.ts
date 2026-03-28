// Google Sheets 한 시트의 한 행 데이터를 표현하는 타입입니다.
// 예: { "이름": "홍길동", "학번": "20251234" }
export type SheetRow = Record<string, string>;

// 시트 조회 결과를 화면에서 바로 쓸 수 있도록 정리한 타입입니다.
export type FetchSheetResult = {
  headers: string[];
  rows: SheetRow[];
  error?: string;
};

type GoogleSheetsValuesResponse = {
  range?: string;
  majorDimension?: string;
  values?: string[][];
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

// Google Sheets URL에서 시트 ID를 추출합니다.
// 예: https://docs.google.com/spreadsheets/d/abc123DEF456/edit -> abc123DEF456
export function extractSheetId(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    const match = parsedUrl.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

// Google Sheets API v4 REST 엔드포인트를 fetch로 직접 호출해 데이터를 읽어옵니다.
// 인증은 읽기 전용 API Key만 사용하며, 60초 캐시를 적용합니다.
export async function fetchSheetData(sheetId: string): Promise<FetchSheetResult> {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;

  if (!apiKey) {
    return {
      headers: [],
      rows: [],
      error: "GOOGLE_SHEETS_API_KEY 환경변수가 설정되지 않았습니다.",
    };
  }

  if (!sheetId) {
    return {
      headers: [],
      rows: [],
      error: "유효한 Google Sheets ID가 필요합니다.",
    };
  }

  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/Sheet1?key=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(endpoint, {
      // Next.js 데이터 캐시: 60초 동안 동일 요청 재사용
      next: { revalidate: 60 },
    });

    const payload = (await response.json()) as GoogleSheetsValuesResponse;

    if (!response.ok) {
      const apiErrorMessage = payload.error?.message;
      return {
        headers: [],
        rows: [],
        error:
          apiErrorMessage ??
          "시트 데이터를 불러오는 중 오류가 발생했습니다. 시트 공개 범위와 시트 ID를 확인해주세요.",
      };
    }

    const values = payload.values ?? [];
    if (values.length === 0) {
      return {
        headers: [],
        rows: [],
      };
    }

    const headers = values[0] ?? [];
    const dataRows = values.slice(1);

    const rows: SheetRow[] = dataRows.map((row) => {
      const mappedRow: SheetRow = {};

      headers.forEach((header, index) => {
        const normalizedHeader = header || `column_${index + 1}`;
        mappedRow[normalizedHeader] = row[index] ?? "";
      });

      return mappedRow;
    });

    return {
      headers,
      rows,
    };
  } catch {
    return {
      headers: [],
      rows: [],
      error: "네트워크 오류로 시트 데이터를 불러오지 못했습니다.",
    };
  }
}
