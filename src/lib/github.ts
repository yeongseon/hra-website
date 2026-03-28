type GitHubRepoInfo = {
  owner: string;
  repo: string;
  token: string;
  branch: string;
};

type GitHubFileResponse = {
  content?: string;
  sha?: string;
  type?: string;
  message?: string;
};

type GitHubDirectoryItem = {
  name: string;
  path: string;
  sha: string;
  type: string;
};

const GITHUB_API_BASE_URL = "https://api.github.com";

function getRepoInfo(): { ok: true; value: GitHubRepoInfo } | { ok: false; error: string } {
  const token = process.env.GITHUB_TOKEN?.trim();
  const repoEnv = process.env.GITHUB_REPO?.trim();
  const branch = process.env.GITHUB_BRANCH?.trim() || "main";

  if (!token) {
    return { ok: false, error: "GITHUB_TOKEN 환경 변수가 설정되지 않았습니다." };
  }

  if (!repoEnv) {
    return { ok: false, error: "GITHUB_REPO 환경 변수가 설정되지 않았습니다." };
  }

  const [owner, repo] = repoEnv.split("/");

  if (!owner || !repo) {
    return {
      ok: false,
      error: "GITHUB_REPO 형식이 올바르지 않습니다. 예: owner/repo",
    };
  }

  return {
    ok: true,
    value: {
      owner,
      repo,
      token,
      branch,
    },
  };
}

function encodeGitHubPath(filePath: string): string {
  return filePath
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function parseGitHubError(data: unknown, fallbackMessage: string): string {
  if (!data || typeof data !== "object") {
    return fallbackMessage;
  }

  const maybeMessage = (data as { message?: unknown }).message;
  if (typeof maybeMessage === "string" && maybeMessage.trim().length > 0) {
    return maybeMessage;
  }

  return fallbackMessage;
}

export async function getFile(path: string): Promise<{ content: string; sha: string } | null> {
  const repoInfo = getRepoInfo();
  if (!repoInfo.ok) {
    return null;
  }

  const { owner, repo, token, branch } = repoInfo.value;
  const encodedPath = encodeGitHubPath(path);
  const url = `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: buildHeaders(token),
    });

    if (response.status === 404) {
      return null;
    }

    const data = (await safeJson(response)) as GitHubFileResponse | GitHubDirectoryItem[] | null;

    if (!response.ok) {
      return null;
    }

    if (!data || Array.isArray(data)) {
      return null;
    }

    if (data.type !== "file" || typeof data.content !== "string" || typeof data.sha !== "string") {
      return null;
    }

    const normalizedBase64 = data.content.replace(/\n/g, "");
    const decodedContent = Buffer.from(normalizedBase64, "base64").toString("utf8");

    return {
      content: decodedContent,
      sha: data.sha,
    };
  } catch {
    return null;
  }
}

export async function createOrUpdateFile(
  path: string,
  content: string,
  message: string,
  sha?: string,
): Promise<{ success: boolean; error?: string }> {
  const repoInfo = getRepoInfo();
  if (!repoInfo.ok) {
    return { success: false, error: repoInfo.error };
  }

  const { owner, repo, token, branch } = repoInfo.value;
  const encodedPath = encodeGitHubPath(path);
  const url = `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/contents/${encodedPath}`;

  try {
    const encodedContent = Buffer.from(content).toString("base64");
    const payload: {
      message: string;
      content: string;
      branch: string;
      sha?: string;
    } = {
      message,
      content: encodedContent,
      branch,
    };

    if (sha) {
      payload.sha = sha;
    }

    const response = await fetch(url, {
      method: "PUT",
      headers: buildHeaders(token),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await safeJson(response);
      return {
        success: false,
        error: parseGitHubError(data, "GitHub 파일 저장에 실패했습니다."),
      };
    }

    return { success: true };
  } catch {
    return {
      success: false,
      error: "GitHub 요청 중 네트워크 오류가 발생했습니다.",
    };
  }
}

export async function deleteFile(
  path: string,
  sha: string,
  message: string,
): Promise<{ success: boolean; error?: string }> {
  const repoInfo = getRepoInfo();
  if (!repoInfo.ok) {
    return { success: false, error: repoInfo.error };
  }

  const { owner, repo, token, branch } = repoInfo.value;
  const encodedPath = encodeGitHubPath(path);
  const url = `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/contents/${encodedPath}`;

  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: buildHeaders(token),
      body: JSON.stringify({
        message,
        sha,
        branch,
      }),
    });

    if (!response.ok) {
      const data = await safeJson(response);
      return {
        success: false,
        error: parseGitHubError(data, "GitHub 파일 삭제에 실패했습니다."),
      };
    }

    return { success: true };
  } catch {
    return {
      success: false,
      error: "GitHub 요청 중 네트워크 오류가 발생했습니다.",
    };
  }
}

export async function listFiles(directoryPath: string): Promise<{ name: string; path: string; sha: string }[]> {
  const repoInfo = getRepoInfo();
  if (!repoInfo.ok) {
    return [];
  }

  const { owner, repo, token, branch } = repoInfo.value;
  const encodedPath = encodeGitHubPath(directoryPath);
  const url = `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: buildHeaders(token),
    });

    if (response.status === 404) {
      return [];
    }

    const data = (await safeJson(response)) as GitHubDirectoryItem[] | GitHubFileResponse | null;

    if (!response.ok || !Array.isArray(data)) {
      return [];
    }

    return data
      .filter((item) => item.type === "file")
      .map((item) => ({
        name: item.name,
        path: item.path,
        sha: item.sha,
      }));
  } catch {
    return [];
  }
}
