import { readFileSync } from "node:fs";

const CLIENT_ID = process.env.CLIENT_ID || "";
const CLIENT_SECRET = process.env.CLIENT_SECRET || "";
const CLOUD_CODE_BASE = process.env.CLOUD_CODE_BASE || "";
const FALLBACK_PROJECT_ID = process.env.FALLBACK_PROJECT_ID || "";
const USER_AGENT = process.env.USER_AGENT || "";

interface Account {
  email?: string;
  enabled?: boolean;
  refreshToken: string;
  managedProjectId?: string;
  projectId?: string;
}

interface AccountsFile {
  accounts?: Account[];
}

interface QuotaInfo {
  remainingFraction?: number;
  resetTime?: string;
}

interface ModelInfo {
  quotaInfo?: QuotaInfo;
}

function parseArgs(): { path: string; accountIndex: number | null } {
  const args = process.argv.slice(2);
  let path = `C:\\Users\\santi\\.config\\opencode\\antigravity-accounts.json`;
  console.log(`Using accounts file: ${path}`);
  let accountIndex: number | null = null;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg === "--path") {
      i += 1;
      const val = args[i];
      if (val !== undefined) path = val;
      continue;
    }
    if (arg === "--account") {
      i += 1;
      const val = args[i];
      if (val !== undefined) {
        const parsed = Number.parseInt(val, 10);
        if (!Number.isNaN(parsed)) accountIndex = parsed - 1;
      }
    }
  }
  return { path, accountIndex };
}

async function postJson(
  url: string,
  token: string,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Token refresh failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }

  const payload = await response.json();
  return payload.access_token;
}

async function loadProjectId(accessToken: string): Promise<string> {
  const body = { metadata: { ideType: "ANTIGRAVITY" } };
  const response = await postJson(
    `${CLOUD_CODE_BASE}/v1internal:loadCodeAssist`,
    accessToken,
    body,
  );
  if (!response.ok) {
    return "";
  }
  const payload = await response.json();
  if (typeof payload.cloudaicompanionProject === "string") {
    return payload.cloudaicompanionProject;
  }
  if (
    payload.cloudaicompanionProject &&
    typeof payload.cloudaicompanionProject.id === "string"
  ) {
    return payload.cloudaicompanionProject.id;
  }
  return "";
}

function formatDuration(targetTime: number): string {
  const delta = targetTime - Date.now();
  if (delta <= 0) return "now";
  const totalSeconds = Math.round(delta / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

async function run(): Promise<void> {
  const { path, accountIndex } = parseArgs();
  const payload = JSON.parse(readFileSync(path, "utf8")) as AccountsFile;
  const accounts = payload.accounts || [];

  if (accounts.length === 0) {
    console.log("No accounts found.");
    return;
  }

  const selected =
    accountIndex === null
      ? accounts.map((account, index) => ({ account, index }))
      : accounts
          .map((account, index) => ({ account, index }))
          .filter((item) => item.index === accountIndex);

  for (const { account, index } of selected) {
    const label = account.email || `Account ${index + 1}`;
    const disabled = account.enabled === false ? " (disabled)" : "";
    console.log(`\n${index + 1}. ${label}${disabled}`);

    try {
      const accessToken = await refreshAccessToken(account.refreshToken);
      let projectId = await loadProjectId(accessToken);
      if (!projectId) {
        projectId =
          account.managedProjectId || account.projectId || FALLBACK_PROJECT_ID;
      }
      console.log(`   project: ${projectId}`);

      const body = projectId ? { project: projectId } : {};
      const response = await postJson(
        `${CLOUD_CODE_BASE}/v1internal:fetchAvailableModels`,
        accessToken,
        body,
      );
      console.log(`   fetchAvailableModels: ${response.status}`);

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        console.log(`   error: ${text.trim().slice(0, 200)}`);
        continue;
      }

      const data = await response.json();
      const models: Record<string, ModelInfo> = data.models || {};
      const rows: { model: string; remaining: string; "resets in": string }[] =
        [];
      for (const [modelName, info] of Object.entries(models)) {
        if (!info?.quotaInfo) continue;
        const remaining = info.quotaInfo.remainingFraction ?? 0;
        const pct = `${Math.round(remaining * 100)}%`;
        const resetTime = info.quotaInfo.resetTime
          ? formatDuration(Date.parse(info.quotaInfo.resetTime))
          : "";
        rows.push({ model: modelName, remaining: pct, "resets in": resetTime });
      }
      const nonFull = rows.filter((row) => row.remaining !== "100%");
      if (nonFull.length === 0) {
        console.log("   All models at 100% quota.");
      } else {
        console.table(nonFull);
      }
    } catch (error) {
      console.log(
        `   error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
